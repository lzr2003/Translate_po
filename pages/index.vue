<template>
  <div class="h-screen p-4">
    <el-card style="width: 100%; height: 100%" :body-style="{ height: '89%' }">
      <template #header>
        <div class="flex items-center justify-between">
          <el-button @click="dialogVisible = true">
            导入PO文件
            <el-icon class="el-icon--right">
              <Upload/>
            </el-icon>
          </el-button>
          <div>服务器在国外访问DeepSeek可能会失败可以多试几次 "一键自动翻译"</div>
          <el-button @click="settingVisible = true" type="primary">
            设置
          </el-button>
        </div>
      </template>
      <template #default>
        <div class="w-full flex items-center justify-end pb-[20px]">
          <el-button class="mr-[10px]" type="danger" @click="reset">
            <el-icon>
              <Refresh/>
            </el-icon>
            还原
          </el-button>
          <el-input
              v-model="targetLanguage"
              class="mr-[10px]"
              @change="clearCache"
              style="width: 120px"
              placeholder="默认目标语言"
          />
          <el-input-number
              class="mr-[10px]"
              v-model="size"
              :min="100"
              :max="5000"
          />
          <el-switch
              class="mr-[10px]"
              v-model="isSync"
              size="large"
              inline-prompt
              active-text="同步"
              inactive-text="异步"
          />
          <el-button
              :disabled="autoTranslating || !tableData.length"
              @click="autoTranslation"
              :loading="autoTranslating"
              type="success"
          >
            一键自动翻译
          </el-button>
          <el-button
              :disabled="!select.length || selectTranslating"
              :loading="selectTranslating"
              @click="
              () => {
                selectTranslating = true;
                translation(select);
              }
            "
              type="success"
          >
            翻译选中项
          </el-button>
          <el-button @click="exportPo">
            导出当前页的翻译
            <el-icon class="el-icon--right"
            >
              <Download
              />
            </el-icon>
          </el-button>
          <el-button
              @click="exportAllPo"
              :disabled="!allTranslations.length"
              type="primary"
              class="ml-[10px]"
          >
            导出所有PO文件
            <el-icon class="el-icon--right">
              <Download/>
            </el-icon>
          </el-button>
        </div>
        <el-tabs
            v-if="allTranslations.length"
            @tab-click="changeTab"
            v-model="tabsValue"
            type="card"
            closable
            @tab-remove="removeTab"
        >
          <el-tab-pane
              v-for="item in allTranslations"
              :label="item.fileName"
              :name="item.fileName"
          >
          </el-tab-pane>
        </el-tabs>
        <Table
            height="88%"
            :columns="columns"
            :table-data="tableData"
            :rowSelection="{ onChange: OnSelect }"
        >
          <template #msgid="{ row, $index }">
            <pre>{{ row.msgid }}</pre>
          </template>
          <template #msgstr="{ row, $index }">
            <el-input
                type="textarea"
                autosize
                @input="
                (value) => {
                  statusChange(value, row);
                }
              "
                :model-value="getMsgstrValue(row)"
                placeholder="请输入翻译后的内容"
            ></el-input>
          </template>
          <template #status="{ row }">
            <el-tag :type="getState(row).type" size="mini">
              {{ getState(row).text }}
            </el-tag>
          </template>
          <template #action="{ row, $index }">
            <el-button
                :loading="getTranslatingState(row)"
                @click="translation(row)"
                type="primary"
                size="mini"
            >
              翻译
            </el-button>
          </template>
        </Table>
      </template>
    </el-card>
    <!-- 上传文件弹窗 -->
    <el-dialog
        v-model="dialogVisible"
        title="上传文件"
        width="500"
        :before-close="handleClose"
    >
      <div class="flex justify-end mb-2">
        <el-switch
            v-model="isFolderMode"
            active-text="文件夹模式"
            inactive-text="文件模式"
            inline-prompt
            style="--el-switch-on-color: #13ce66; --el-switch-off-color: #409eff"
        />
      </div>
      <el-upload
          :key="isFolderMode ? 'folder-mode' : 'file-mode'"
          drag
          v-model:file-list="fileList"
          :auto-upload="true"
          action="./api/content"
          :on-success="handleSuccess"
          :on-error="handleError"
          :multiple="true"
          :limit="100"
          accept=".po,.zip"
          :webkitdirectory="isFolderMode"
      >
        <el-icon class="el-icon--upload">
          <upload-filled/>
        </el-icon>
        <div class="el-upload__text" v-if="!isFolderMode">
          拖拽文件到此处，或 <em>点击上传</em><br>
          <span class="text-xs text-gray-400">支持 .po 文件或 .zip 压缩包</span>
        </div>
        <div class="el-upload__text" v-else>
          拖拽文件夹到此处，或 <em>点击上传文件夹</em><br>
          <span class="text-xs text-gray-400">请选择包含 .po 文件的语言文件夹</span>
        </div>
        <div class="el-upload__hint">
          支持直接上传 ZIP 压缩包（包含 .po 文件即可），或切换到“文件夹模式”上传目录。<br>
          系统会自动识别 <code>语言/game.po</code> 或 <code>语言.po</code> 格式。
        </div>
      </el-upload>
      <template #footer>
        <div class="flex justify-center">
          <el-button type="primary" @click="dialogVisible = false">
            完成
          </el-button>
        </div>
      </template>
    </el-dialog>
    <!-- 设置弹窗 -->
    <el-dialog
        v-model="settingVisible"
        title="设置"
        width="500"
        :before-close="handleClose"
    >
      <el-form :model="settings" label-width="80px" style="max-width: 600px">
        <el-form-item label="AI">
          <el-select v-model="settings.ai" placeholder="请选择AI">
            <el-option
                v-for="item in aiList"
                :label="item.label"
                :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型">
          <el-select v-model="settings.model" placeholder="请选择模型">
            <el-option
                v-for="item in aiModel[settings.ai]"
                :label="item.label"
                :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
              type="password"
              placeholder="请输入API Key"
              show-password
              v-model="settings.apiKey"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-center">
          <el-button type="primary" @click="saveSetting"> 完成</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {ref, onMounted} from "vue";
import {Upload, UploadFilled, Download, Refresh} from "@element-plus/icons-vue";
import {ElNotification} from 'element-plus'

const fileList = ref([]);
const changeMsgstr = ref({}); // 结构优化: { fileName: { context: { msgid: translation } } }
const select = ref([]);
const columns = ref([
  {
    prop: "msgid",
    label: "原文",
    slot: "msgid",
  },
  {
    prop: "msgstr",
    label: "翻译后的内容",
    slot: "msgstr",
  },
  {
    prop: "status",
    label: "状态",
    slot: "status",
    width: 100,
  },
  {
    prop: "action",
    label: "操作",
    slot: "action",
    width: 150,
  },
]);
const dialogVisible = ref(false);
const settingVisible = ref(false);
const isFolderMode = ref(false);

const settings = ref({
  ai: "DeepSeek",
  model: "deepseek-chat",
  apiKey: "",
});
const targetLanguage = ref("chinese");
const tabsValue = ref("");
const allTranslations = ref([]);
const translating = ref({});
const failTranslating = ref({});
const tableData = ref([]);
const selectTranslating = ref(false);
let size = ref(1000);
let isSync = ref(false);
const autoTranslating = ref(false);
let cache = {};

const aiList = ref([
  {
    label: "DeepSeek",
    value: "DeepSeek",
  },
]);

const aiModel = ref({
  DeepSeek: [
    {
      label: "deepseek-chat",
      value: "deepseek-chat",
    },
    {
      label: "deepseek-reasoner",
      value: "deepseek-reasoner",
    },
  ],
});

// 生成唯一键，用于在 changeMsgstr 中定位翻译
const getUniqueKey = (row) => {
  return `${row.context}|||${row.msgid}`;
};

// 获取单个翻译值
const getMsgstrValue = (row) => {
  if (changeMsgstr.value[tabsValue.value] &&
      changeMsgstr.value[tabsValue.value][row.context] &&
      changeMsgstr.value[tabsValue.value][row.context].hasOwnProperty(row.msgid)) {
    return changeMsgstr.value[tabsValue.value][row.context][row.msgid];
  }
  return row.msgstr;
};

// 获取单个翻译状态
const getTranslatingState = (row) => {
  const key = getUniqueKey(row);
  return translating.value[key];
};

const getState = (row) => {
  const key = getUniqueKey(row);

  if (translating.value[key]) {
    return {
      text: "翻译中",
      type: "info",
    };
  } else if (failTranslating.value[key]) {
    return {
      text: "翻译失败",
      type: "danger",
    };
  } else {
    // 获取当前显示的翻译内容
    let currentMsgstr = getMsgstrValue(row);

    // 3. 根据内容判断状态
    if (currentMsgstr && currentMsgstr.trim() !== '') {
      return {
        text: "已翻译",
        type: "primary",
      };
    } else {
      return {
        text: "未翻译",
        type: "success",
      };

    }
  }
};
const clearCache = () => {
  console.log("clearCache");
  cache = {};
};
onMounted(() => {
  const settingsStr = localStorage.getItem("settings");
  if (settingsStr) {
    settings.value = JSON.parse(settingsStr);
  }
});
const reset = () => {
  cache = {}
  changeMsgstr.value = {}
  failTranslating.value = {}
  selectTranslating.value = false
  autoTranslating.value = false
}
const saveSetting = () => {
  settingVisible.value = false;
  localStorage.setItem("settings", JSON.stringify(settings.value));
};

const handleClose = () => {
}

const handleError = (err, file, fileList) => {
  console.error("Upload Error:", err);
  let errorMessage = '文件上传或解析失败，请检查文件格式。';
  if (err.message) {
    try {
      if (err.message.includes('statusMessage')) {
        const match = err.message.match(/"statusMessage":"(.*?)"/);
        if (match && match[1]) {
          errorMessage = match[1];
        }
      } else {
        errorMessage = err.message.length > 200 ? err.message.substring(0, 200) + '...' : err.message;
      }
    } catch (e) {}
  }

  ElNotification({
    title: '解析失败',
    message: errorMessage,
    type: 'error',
    duration: 5000
  });
};

const handleSuccess = (response, file, fileList) => {
  if (response.allTranslations && response.allTranslations.length) {
    const newItems = [];
    const existingNames = new Set(allTranslations.value.map(t => t.fileName));

    response.allTranslations.forEach(item => {
      let displayName = '';
      let originalName = item.fileName || 'game.po';
      let langCode = null;

      if (item.language) {
        langCode = item.language;
      }
      else if (item.fileName && /[/\\]/.test(item.fileName)) {
        const parts = item.fileName.split(/[/\\]/);
        const validParts = parts.filter(p => p);
        if (validParts.length >= 2) {
          langCode = validParts[validParts.length - 2];
        }
      }

      if (langCode) {
        displayName = langCode.endsWith('.po') ? langCode : `${langCode}.po`;
      } else {
        const parts = (item.fileName || 'unknown.po').split(/[/\\]/);
        displayName = parts[parts.length - 1];
      }

      let uniqueName = displayName;
      let counter = 1;

      while (existingNames.has(uniqueName)) {
        const dotIndex = displayName.lastIndexOf('.');
        if (dotIndex !== -1) {
          const namePart = displayName.substring(0, dotIndex);
          const extPart = displayName.substring(dotIndex);
          uniqueName = `${namePart} (${counter})${extPart}`;
        } else {
          uniqueName = `${displayName} (${counter})`;
        }
        counter++;
      }

      existingNames.add(uniqueName);

      newItems.push({
        ...item,
        fileName: uniqueName,
        originalName: originalName
      });
    });

    allTranslations.value = [...allTranslations.value, ...newItems];

    if (tabsValue.value === "" && newItems.length > 0) {
      tabsValue.value = newItems[0].fileName;
      tableData.value = newItems[0].translations;
    }

    ElNotification({
      title: '成功',
      message: `成功导入 ${newItems.length} 个语言文件`,
      type: 'success'
    });
  }
};

const changeTab = (item) => {
  tabsValue.value = item.paneName;
  const targetTranslation = allTranslations.value.find(t => t.fileName === item.paneName);
  if (targetTranslation) {
    tableData.value = targetTranslation.translations;
  }
};
const removeTab = (item) => {
  allTranslations.value = allTranslations.value.filter(
      (translation) => translation.fileName !== item
  );

  if (allTranslations.value.length) {
    tabsValue.value = allTranslations.value[0].fileName;
    tableData.value = allTranslations.value[0].translations;
  } else {
    tabsValue.value = "";
    tableData.value = [];
  }
};
const statusChange = (value, row) => {
  if (!changeMsgstr.value[tabsValue.value]) {
    changeMsgstr.value[tabsValue.value] = {};
  }
  if (!changeMsgstr.value[tabsValue.value][row.context]) {
    changeMsgstr.value[tabsValue.value][row.context] = {};
  }

  const key = getUniqueKey(row); // 用于失败状态

  if (value === '') {
    changeMsgstr.value[tabsValue.value][row.context][row.msgid] = '';
    if (failTranslating.value[key]) {
      delete failTranslating.value[key];
    }
    return;
  }

  if (value === row.msgstr) {
    // 如果恢复原值，删除修改记录
    delete changeMsgstr.value[tabsValue.value][row.context][row.msgid];
    // 清理空对象
    if (Object.keys(changeMsgstr.value[tabsValue.value][row.context]).length === 0) {
      delete changeMsgstr.value[tabsValue.value][row.context];
    }
  } else {
    changeMsgstr.value[tabsValue.value][row.context][row.msgid] = value;
  }
};

const translation = async (row, targetFileName = tabsValue.value, specificTargetLanguage = null) => {
  if (settings.value.apiKey === "") {
    ElNotification({
      title: '提示',
      message: '请先设置API Key',
      type: 'warning'
    });
    return;
  }

  let isArray = Array.isArray(row);
  let rows = isArray ? row : [row];

  rows = rows.filter(item => {
    // 检查对应文件的 changeMsgstr (嵌套结构)
    const currentTranslation = changeMsgstr.value[targetFileName]?.[item.context]?.[item.msgid];
    return !currentTranslation || currentTranslation.trim() === '';
  });

  if (rows.length === 0) {
    if (selectTranslating.value) {
      selectTranslating.value = false;
    }
    return;
  }

  const outputs = [];
  const placeholdersList = [];
  let cacheKeys = {};

  rows.forEach((item) => {
    if (!cacheKeys[item.msgid]) {
      // 存储 context 列表，以便回填
      cacheKeys[item.msgid] = [item.context];
    } else {
      cacheKeys[item.msgid].push(item.context);
    }
  });

  let keys = Object.keys(cacheKeys);

  // 检查缓存并设置 loading 状态
  keys.forEach((msgid) => {
    // 这里的 item 是 msgid
    if (cache[msgid]) {
      cacheKeys[msgid].forEach((context) => {
        if (!changeMsgstr.value[targetFileName]) changeMsgstr.value[targetFileName] = {};
        if (!changeMsgstr.value[targetFileName][context]) changeMsgstr.value[targetFileName][context] = {};

        changeMsgstr.value[targetFileName][context][msgid] = cache[msgid];

        const key = `${context}|||${msgid}`;
        translating.value[key] = false;
      });
      cacheKeys[msgid] = null;
      delete cacheKeys[msgid];
      return;
    }

    const input = msgid;
    const regex = /{([^}]+)}/g;
    const placeholders = [];
    const output = input.replace(regex, (match, p1) => {
      const placeholder = `{{${placeholders.length}}}`;
      placeholders.push(p1);
      return placeholder;
    });

    outputs.push(output);
    placeholdersList.push(placeholders);

    // 设置 loading
    cacheKeys[msgid].forEach((context) => {
      const key = `${context}|||${msgid}`;
      translating.value[key] = true;
    });
  });

  if (outputs.length === 0) {
    return;
  }

  try {
    const {message, code} = await $fetch("/api/translation", {
      method: "post",
      body: {
        ...settings.value,
        targetLanguage: specificTargetLanguage || targetLanguage.value,
        text: outputs,
      },
    });

    if (code !== 200) {
      throw new Error("翻译失败");
    }

    const restoredTranslations = message.map((translatedText, i) => {
      let restoredText = translatedText;
      placeholdersList[i].forEach((placeholderValue, index) => {
        const placeholder = `{{${index}}}`;
        restoredText = restoredText.replace(
            placeholder,
            `{${placeholderValue}}`
        );
      });
      return restoredText;
    });

    // 回填翻译结果
    keys = Object.keys(cacheKeys); // 这些是 msgid
    keys.forEach((msgid, index) => {
      cacheKeys[msgid].forEach((context) => {
        if (!changeMsgstr.value[targetFileName]) changeMsgstr.value[targetFileName] = {};
        if (!changeMsgstr.value[targetFileName][context]) changeMsgstr.value[targetFileName][context] = {};

        changeMsgstr.value[targetFileName][context][msgid] = restoredTranslations[index];

        const key = `${context}|||${msgid}`;
        if (translating.value.hasOwnProperty(key)) delete translating.value[key];
        if (failTranslating.value.hasOwnProperty(key)) delete failTranslating.value[key];
      });
      cache[msgid] = restoredTranslations[index];
    });

    if (targetFileName === tabsValue.value) {
      selectTranslating.value = false;
    }

  } catch (error) {
    rows.forEach((item) => {
      const key = getUniqueKey(item);
      translating.value[key] = false;
      failTranslating.value[key] = true;
      if (changeMsgstr.value[targetFileName]?.[item.context]) {
        delete changeMsgstr.value[targetFileName][item.context][item.msgid]
      }
    });
    throw error;
  }
};

const autoTranslation = async () => {
  if (!allTranslations.value.length) return;

  autoTranslating.value = true;
  failTranslating.value = {};
  console.log('开始全文件自动翻译...');

  for (const fileItem of allTranslations.value) {
    const fileName = fileItem.fileName;
    const translationsList = fileItem.translations;

    let derivedLang = fileName.replace(/\.po$/i, '');
    derivedLang = derivedLang.replace(/\s*\(\d+\)$/, '').trim();

    const fileTargetLang = (derivedLang &&
        derivedLang.toLowerCase() !== 'game' &&
        derivedLang.toLowerCase() !== 'unknown')
        ? derivedLang
        : targetLanguage.value;

    console.log(`正在处理文件: ${fileName}, 目标语言: ${fileTargetLang}`);

    let currentSize = 0;
    let rows = [];

    for (let index = 0; index < translationsList.length; index++) {
      const row = translationsList[index];
      const context = row.context;

      // 检查是否存在翻译 (嵌套结构)
      const currentMsgstr = changeMsgstr.value[fileName]?.[context]?.[row.msgid] ?? row.msgstr;
      if (currentMsgstr && currentMsgstr.trim() !== '') {
        continue;
      }

      if (currentSize + row.msgid.length < size.value) {
        rows.push(row);
        currentSize += row.msgid.length;
      } else {
        if (isSync.value) {
          await translation(rows, fileName, fileTargetLang);
        } else {
          translation(rows, fileName, fileTargetLang);
        }
        rows = [row];
        currentSize = row.msgid.length;
      }
    }

    if (rows.length > 0) {
      if (isSync.value) {
        await translation(rows, fileName, fileTargetLang);
      } else {
        translation(rows, fileName, fileTargetLang);
      }
    }
  }

  autoTranslating.value = false;
};

const OnSelect = (selection) => {
  select.value = selection;
};

const exportPo = async () => {
  try {
    const formData = new FormData();
    // 发送嵌套结构的翻译数据
    formData.append("translation", JSON.stringify(changeMsgstr.value[tabsValue.value] || {}));
    formData.append("fileName", tabsValue.value);

    const currentFile = fileList.value.find(file => file.name === tabsValue.value || file.name.includes(tabsValue.value));
    if (currentFile) {
      formData.append("file", currentFile.raw);
    }

    const data = await $fetch("/api/download", {
      method: "post",
      body: formData,
    });

    const blob = new Blob([data], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tabsValue.value.endsWith('.po') ? tabsValue.value : `${tabsValue.value}.po`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.log(error);
  }
};

const exportAllPo = async () => {
  try {
    const formData = new FormData();
    // 发送嵌套结构的翻译数据
    const allTranslationData = {
      translations: changeMsgstr.value, // 现在是 { file: { context: { msgid: str } } }
      fileNames: allTranslations.value.map(item => item.fileName)
    };

    formData.append("allData", JSON.stringify(allTranslationData));
    fileList.value.forEach(file => {
      formData.append("files", file.raw, file.name);
    });

    const data = await $fetch("/api/download-all", {
      method: "post",
      body: formData,
    });

    const blob = new Blob([data], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "translations.zip";
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.log(error);
    ElNotification({
      title: '错误',
      message: '导出所有文件失败',
      type: 'error'
    });
  }
};
</script>