import { po } from 'gettext-parser';
import AdmZip from 'adm-zip';
import { createError, readMultipartFormData, defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
    // 1. 读取 FormData
    const files = await readMultipartFormData(event);
    if (!files || files.length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: '未接收到任何文件数据 (No files uploaded)'
        });
    }

    // 2. 提取并验证 allData (前端传来的翻译数据)
    const allDataItem = files.find(f => f.name === 'allData');
    if (!allDataItem) {
        throw createError({
            statusCode: 400,
            statusMessage: '缺少翻译数据参数 (Missing "allData" field)'
        });
    }

    let allTranslationData;
    try {
        allTranslationData = JSON.parse(allDataItem.data.toString('utf-8'));
    } catch (e) {
        throw createError({
            statusCode: 400,
            statusMessage: `翻译数据 JSON 解析失败: ${e.message}`
        });
    }

    // translations 结构: { "tr.po": { "context": { "msgid": "translation" } }, ... }
    const { translations } = allTranslationData;
    const outputZip = new AdmZip();
    const errorDetails = [];
    let processedCount = 0;

    // 3. 处理文件 (支持 ZIP 和 单个 PO)
    const fileItems = files.filter(f => f.name === 'files');

    for (const file of fileItems) {
        const fileName = file.filename || 'unknown';

        try {
            // A. 处理 ZIP 文件
            if (fileName.endsWith('.zip')) {
                let inputZip;
                try {
                    inputZip = new AdmZip(file.data);
                } catch (e) {
                    errorDetails.push(`压缩包 ${fileName} 损坏或无法读取`);
                    continue;
                }

                const zipEntries = inputZip.getEntries();
                for (const entry of zipEntries) {
                    if (entry.isDirectory || !entry.entryName.endsWith('.po')) continue;

                    try {
                        const entryPath = entry.entryName;
                        const pathParts = entryPath.split(/[\\/]/);
                        const lastPart = pathParts[pathParts.length - 1].toLowerCase();
                        let language = '';

                        // 策略: "tr/Game.po" -> "tr" 或 "tr.po" -> "tr"
                        if (pathParts.length >= 2 && lastPart === 'game.po') {
                            language = pathParts[pathParts.length - 2].trim();
                        } else {
                            language = pathParts[pathParts.length - 1].replace(/\.po$/i, '').trim();
                        }

                        const translationKey = `${language}.po`;

                        const poContent = inputZip.readAsText(entry);
                        const compiledBuffer = applyTranslations(poContent, translations, translationKey, entryPath, errorDetails);

                        if (compiledBuffer) {
                            outputZip.addFile(entry.entryName, compiledBuffer);
                            processedCount++;
                        }
                    } catch (entryErr) {
                        errorDetails.push(`处理 ZIP 条目 ${entry.entryName} 失败: ${entryErr.message}`);
                    }
                }
            }
            // B. 处理单个 PO 文件
            else if (fileName.endsWith('.po')) {
                try {
                    // 对于单文件，尝试直接使用文件名匹配，或者默认匹配
                    const translationKey = fileName; // 例如 "tr.po"

                    const poContent = file.data.toString('utf-8');
                    const compiledBuffer = applyTranslations(poContent, translations, translationKey, fileName, errorDetails);

                    if (compiledBuffer) {
                        outputZip.addFile(fileName, compiledBuffer);
                        processedCount++;
                    }
                } catch (poErr) {
                    errorDetails.push(`处理文件 ${fileName} 失败: ${poErr.message}`);
                }
            }
        } catch (err) {
            errorDetails.push(`文件 ${fileName} 处理异常: ${err.message}`);
        }
    }

    if (processedCount === 0) {
        const baseMsg = '无法生成任何翻译文件。';
        const details = errorDetails.length > 0 ? ` 原因: ${errorDetails.join('; ')}` : ' 请检查上传的文件是否包含有效的 .po 文件。';

        throw createError({
            statusCode: 400,
            statusMessage: baseMsg + details
        });
    }

    event.node.res.setHeader('Content-Disposition', 'attachment; filename="translations-export.zip"');
    event.node.res.setHeader('Content-Type', 'application/zip');

    return outputZip.toBuffer();
});

// 辅助函数：应用翻译并编译
function applyTranslations(poContent, allTranslationsMap, key, logName, errorDetails) {
    try {
        const parsedPo = po.parse(poContent);

        let targetTranslations = allTranslationsMap[key];

        // 模糊匹配回退 (处理 "de (1).po" 等情况)
        if (!targetTranslations) {
            const simpleKey = key.replace('.po', '');
            if (allTranslationsMap[simpleKey]) {
                targetTranslations = allTranslationsMap[simpleKey];
            }
        }

        if (!targetTranslations) {
            // 如果没有翻译数据，原样返回
            return po.compile(parsedPo);
        }

        // 应用翻译
        // targetTranslations 结构: { context: { msgid: translation } }S
        for (const context in parsedPo.translations) {
            // context 可能为空字符串 ""，这在嵌套结构中是合法的 key
            if (!targetTranslations[context]) continue;

            for (const msgid in parsedPo.translations[context]) {
                const newMsgstr = targetTranslations[context][msgid];

                if (newMsgstr !== undefined && newMsgstr !== null) {
                    const entry = parsedPo.translations[context][msgid];
                    entry.msgstr = [newMsgstr];
                }
            }
        }

        return po.compile(parsedPo);

    } catch (e) {
        errorDetails.push(`${logName} 解析或编译错误: ${e.message}`);
        return null;
    }
}