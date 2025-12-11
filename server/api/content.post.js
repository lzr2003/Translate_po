import { po } from 'gettext-parser';
import AdmZip from 'adm-zip';
import { createError, readMultipartFormData, defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
    // 读取上传的文件
    const files = await readMultipartFormData(event);
    if (!files || files.length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: '未上传任何文件'
        });
    }

    let allTranslations = [];
    const processedLanguages = new Set();
    const errorDetails = []; // 收集具体错误信息
    let scannedFilesCount = 0; // 统计扫描到的文件数

    // 处理每个上传的文件
    for (const file of files) {
        const fileName = file.filename;
        const fileData = file.data;

        // 跳过空文件
        if (fileData.length === 0) {
            continue;
        }

        // 1. 处理ZIP压缩包
        if (fileName.endsWith('.zip')) {
            try {
                const zip = new AdmZip(fileData);
                const zipEntries = zip.getEntries();

                if (zipEntries.length === 0) {
                    errorDetails.push(`压缩包 ${fileName} 是空的`);
                }

                for (const entry of zipEntries) {
                    if (entry.isDirectory) continue;

                    const entryPath = entry.entryName;
                    scannedFilesCount++;

                    // 跳过Mac系统文件
                    if (entryPath.includes('__MACOSX') || entryPath.startsWith('.')) continue;

                    // 仅处理 .po 文件
                    if (!entryPath.endsWith('.po')) {
                        continue;
                    }

                    const pathParts = entryPath.split(/[\\/]/);
                    let language = '';
                    const lastPart = pathParts[pathParts.length - 1].toLowerCase();

                    // 策略A: 标准格式 "语言/Game.po" (忽略大小写)
                    if (pathParts.length >= 2 && lastPart === 'game.po') {
                        language = pathParts[pathParts.length - 2].trim();
                    }
                    // 策略B: 扁平格式 "语言.po"
                    else if (lastPart !== 'game.po') {
                        language = pathParts[pathParts.length - 1].replace(/\.po$/i, '').trim();
                    }

                    if (!language) {
                        errorDetails.push(`文件 ${entryPath} 无法识别语言代码`);
                        continue;
                    }

                    if (processedLanguages.has(language)) {
                        //continue; // 重复语言静默跳过
                    }

                    try {
                        const poContent = zip.readAsText(entry);
                        // 校验内容是否为空
                        if (!poContent || poContent.trim().length === 0) {
                            errorDetails.push(`${entryPath} 内容为空`);
                            continue;
                        }

                        const translations = parsePoContent(poContent, language);
                        allTranslations.push(translations);
                        processedLanguages.add(language);
                    } catch (poError) {
                        console.error(`解析失败: ${entryPath}`, poError);
                        errorDetails.push(`${entryPath} 解析错误: ${poError.message}`);
                    }
                }
            } catch (zipError) {
                console.error('处理ZIP文件失败:', zipError);
                errorDetails.push(`${fileName} 不是有效的 ZIP 文件或已损坏`);
            }
        }

        // 2. 处理直接上传的PO文件 (兼容文件夹拖拽上传)
        else if (fileName.endsWith('.po')) {
            scannedFilesCount++;
            try {
                let language = '';
                const pathParts = fileName.split(/[\\/]/);
                const lastPart = pathParts[pathParts.length - 1].toLowerCase();

                if (pathParts.length >= 2 && lastPart === 'game.po') {
                    language = pathParts[pathParts.length - 2].trim();
                } else {
                    language = pathParts[pathParts.length - 1].replace(/\.po$/i, '').trim();
                }

                // 如果没解析出来，用文件名兜底
                if (!language) {
                    language = fileName.replace(/\.po$/i, '').trim();
                }

                if (language && !processedLanguages.has(language)) {
                    const poContent = fileData.toString('utf-8');
                    const translations = parsePoContent(poContent, language);
                    allTranslations.push(translations);
                    processedLanguages.add(language);
                }
            } catch (err) {
                errorDetails.push(`${fileName} 处理失败: ${err.message}`);
            }
        }
    }

    if (allTranslations.length === 0) {
        // 构建详细的错误消息
        let msg = '未找到有效的 PO 文件。';
        if (scannedFilesCount === 0) {
            msg += '上传的文件中似乎不包含任何文件。';
        } else if (errorDetails.length > 0) {
            msg += '错误详情: ' + errorDetails.slice(0, 3).join('; ');
            if (errorDetails.length > 3) msg += '...';
        } else {
            msg += `已扫描 ${scannedFilesCount} 个文件，但没有匹配到 .po 文件。请检查文件后缀是否正确。`;
        }

        throw createError({
            statusCode: 400,
            statusMessage: msg
        });
    }

    return { allTranslations };
});

function parsePoContent(poContent, language) {
    const parsed = po.parse(poContent);
    const translationsList = formatTranslations(parsed.translations);

    // 检查解析结果是否为空
    if (translationsList.length === 0) {
        throw new Error('解析成功但未找到翻译条目');
    }

    // 修改的核心点：直接在这里构造好带后缀的文件名
    // 这样前端收到就是 "tr.po", "de.po" 等
    const fileName = `${language}.po`;

    return {
        fileName: fileName,
        language: language,
        translations: translationsList
    };
}

function formatTranslations(translations) {
    const list = [];
    let index = 0;

    for (const context in translations) {
        if (context === '') continue;
        for (const msgid in translations[context]) {
            if (msgid === '') continue;
            list.push({
                index: index++,
                context: context,
                msgid: msgid,
                msgstr: translations[context][msgid].msgstr[0] || ''
            });
        }
    }
    return list;
}