import { po } from 'gettext-parser';
import { createError, readMultipartFormData, defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
    const files = await readMultipartFormData(event);
    if (!files || files.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'No data uploaded' });
    }

    const translationField = files.find(f => f.name === 'translation');
    const fileField = files.find(f => f.name === 'file');

    if (!translationField || !fileField) {
        throw createError({ statusCode: 400, statusMessage: 'Missing translation data or file' });
    }

    let translations;
    try {
        // 结构: { context: { msgid: translation } }
        translations = JSON.parse(translationField.data.toString('utf-8'));
    } catch (e) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid JSON data' });
    }

    try {
        const poContent = fileField.data.toString('utf-8');
        const parsedPo = po.parse(poContent);

        // 应用翻译
        for (const context in parsedPo.translations) {
            if (!translations[context]) continue;

            for (const msgid in parsedPo.translations[context]) {
                const newMsgstr = translations[context][msgid];
                if (newMsgstr !== undefined && newMsgstr !== null) {
                    parsedPo.translations[context][msgid].msgstr = [newMsgstr];
                }
            }
        }

        const compiled = po.compile(parsedPo);
        return compiled;
    } catch (e) {
        throw createError({ statusCode: 500, statusMessage: `Processing failed: ${e.message}` });
    }
});