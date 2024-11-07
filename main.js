// 在檔案開頭加入
const JAVA_BASIC_TYPES = [
  'String',
  'int',
  'Integer',
  'long',
  'Long',
  'double',
  'Double',
  'float',
  'Float',
  'boolean',
  'Boolean',
  'byte',
  'Byte',
  'short',
  'Short',
  'char',
  'Character',
  'BigDecimal',
  'LocalDateTime',
  'LocalDate',
  'LocalTime'
];

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 處理 import 語句的添加
async function addImportIfNeeded(filePath, javaType) {
  if (JAVA_BASIC_TYPES.includes(javaType)) {
    return; // 如果是基本型態就不需要加入 import
  }

  try {
    let content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    let packageLineIndex = -1;

    // 找到 package 行
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('package ')) {
        packageLineIndex = i;
        break;
      }
    }

    if (packageLineIndex !== -1) {
      // 建立 import 語句
      const importStatement = `import tw.com.softleader.jasmine.enums.${javaType};`;

      // 檢查是否已經存在相同的 import
      const hasImport = content.includes(importStatement);
      if (!hasImport) {
        // 在 package 行後插入 import
        lines.splice(packageLineIndex + 1, 0, importStatement, '');
        content = lines.join('\n');
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`Added import statement to ${filePath}`);
      }
    }
  } catch (error) {
    console.error(`Error adding import to ${filePath}:`, error);
  }
}

// 新增這個輔助函數
function createIndentedField(javadoc, javaType, variableName, additionalAnnotations = '', indent = 2) {
  const spaces = ' '.repeat(indent);
  let content = `${spaces}/** ${javadoc} */\n`;

  // 處理 additionalAnnotations
  if (typeof additionalAnnotations === 'string') {
    if (additionalAnnotations.includes('@Schema') && !additionalAnnotations.includes('example')) {
      // 如果是 Schema 註解但不包含 example，移除 example 部分
      additionalAnnotations = additionalAnnotations.replace(/, example = "[^"]*"/, '');
    }
    if (additionalAnnotations) {
      content += `${spaces}${additionalAnnotations}\n`;
    }
  } else if (Array.isArray(additionalAnnotations)) {
    // 如果是陣列，每個註解都加上縮排並換行
    additionalAnnotations.forEach(annotation => {
      content += `${spaces}${annotation}\n`;
    });
  }

  content += `${spaces}private ${javaType} ${variableName};`;
  return content;
}

async function findFiles(dir, filePatterns) {
  try {
    const foundFiles = [];
    const files = await fs.readdir(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        const results = await findFiles(fullPath, filePatterns);
        foundFiles.push(...results);
      } else {
        if (filePatterns.includes(file)) {
          foundFiles.push(fullPath);
        }
      }
    }

    return foundFiles;
  } catch (error) {
    console.error(`Error searching in ${dir}:`, error);
    return [];
  }
}

async function addFieldToFile(filePath, fieldContent, targetVariable, javaType) {
  try {
    console.log(`Try to read file: ${filePath}`);
    console.log(`Target variable: ${targetVariable}`);

    // 先處理 import
    await addImportIfNeeded(filePath, javaType);

    let content = await fs.readFile(filePath, 'utf8');

    if (targetVariable) {
      const lines = content.split('\n');
      let insertIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(targetVariable) && lines[i].includes(';')) {
          insertIndex = i;
          break;
        }
      }

      if (insertIndex !== -1) {
        const beforeLines = lines.slice(0, insertIndex + 1).join('\n');
        const afterLines = lines.slice(insertIndex + 1).join('\n');
        content = beforeLines + '\n\n' + fieldContent + '\n' + afterLines;
        console.log(`Found target variable at line ${insertIndex + 1}`);
      } else {
        const listRegex = /List\s*<.*?>\s+\w+\s*;/;
        const listMatch = content.match(listRegex);

        if (listMatch) {
          console.log('Found List declaration');
          const insertPoint = content.indexOf(listMatch[0]);
          content = content.slice(0, insertPoint) +
                   fieldContent + '\n\n' + content.slice(insertPoint);
        } else {
          console.log('No target variable or List found, appending to end');
          const lastBraceIndex = content.lastIndexOf('}');
          if (lastBraceIndex !== -1) {
            content = content.slice(0, lastBraceIndex) +
                     '\n' + fieldContent + '\n' +
                     content.slice(lastBraceIndex);
          }
        }
      }
    } else {
      const listRegex = /List\s*<.*?>\s+\w+\s*;/;
      const listMatch = content.match(listRegex);

      if (listMatch) {
        console.log('Found List declaration, inserting before it');
        const insertPoint = content.indexOf(listMatch[0]);
        content = content.slice(0, insertPoint) +
                 fieldContent + '\n\n' + content.slice(insertPoint);
      } else {
        console.log('No List found, appending to end');
        const lastBraceIndex = content.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          content = content.slice(0, lastBraceIndex) +
                   '\n' + fieldContent + '\n' +
                   content.slice(lastBraceIndex);
        }
      }
    }

    await fs.writeFile(filePath, content, 'utf8');
    console.log(`Successfully modified ${filePath}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File not found: ${filePath}`);
      return false;
    }
    console.error(`Error processing file ${filePath}:`, error);
    throw error;
  }
}

ipcMain.handle('generate-fields', async (event, data) => {
  const {
    tableName,
    dbFieldName,
    javaType,
    variableName,
    javadoc,
    example,
    spec,
    projectPath,
    targetVariable
  } = data;

  try {
    const filePatterns = [
      `${tableName}Dto.java`,
      `${tableName}ReplaceRequest.java`,
      `${tableName}CreateRequest.java`,
      `${tableName}SaveRequest.java`,
      `${tableName}SaveCmd.java`,
      `${tableName}Criteria.java`,
      `${tableName}Vo.java`,
      `${tableName}Entity.java`,
      `${tableName}QueryRequest.java`
    ];

    console.log('Project path:', projectPath);
    console.log('Table name:', tableName);
    console.log('Looking for files:', filePatterns);

    const files = await findFiles(projectPath, filePatterns);
    console.log('Found files:', files);

    const modifiedFiles = [];
    const errors = [];

    for (const file of files) {
      try {
        let fieldContent = '';
        const fileName = path.basename(file);

        if (fileName.endsWith('Entity.java')) {
          const annotations = [];
          annotations.push(`@Column(name = "${dbFieldName}")`);
          if (!JAVA_BASIC_TYPES.includes(javaType)) {
            annotations.push('@Enumerated(EnumType.STRING)');
          }

          fieldContent = createIndentedField(
            javadoc,
            javaType,
            variableName,
            annotations
          );
        } else if (fileName.endsWith('Criteria.java')) {
          if (spec) {
            fieldContent = createIndentedField(
              javadoc,
              javaType,
              variableName,
              spec
            );
          }
        } else if (fileName.endsWith('QueryRequest.java')) {
          if (spec) {
            fieldContent = createIndentedField(
              javadoc,
              javaType,
              variableName
            );
          }
        } else if (fileName.endsWith('Dto.java') ||
                  (fileName.includes('Request.java') && !fileName.endsWith('QueryRequest.java'))) {
          let schemaAnnotation = `@Schema(description = "${javadoc}"`;
          if (example) {  // 只有在有 example 時才加入
            schemaAnnotation += `, example = "${example}"`;
          }
          schemaAnnotation += ')';

          fieldContent = createIndentedField(
            javadoc,
            javaType,
            variableName,
            schemaAnnotation
          );
        } else {
          fieldContent = createIndentedField(
            javadoc,
            javaType,
            variableName
          );
        }

        if (fieldContent) {
          const success = await addFieldToFile(file, fieldContent, targetVariable, javaType);
          if (success) {
            modifiedFiles.push(file);
          }
        } else {
          console.log(`Skipping file ${fileName} as no field content was generated`);
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
        errors.push(`Error processing ${file}: ${error.message}`);
      }
    }

    try {
      const dirContents = await fs.readdir(projectPath);
      console.log('Directory contents:', dirContents);
    } catch (error) {
      console.error('Read directory error:', error);
    }

    if (modifiedFiles.length > 0) {
      return {
        success: true,
        message: `成功修改以下檔案:\n${modifiedFiles.join('\n')}` +
                (errors.length ? `\n\n警告:\n${errors.join('\n')}` : '')
      };
    } else {
      return {
        success: false,
        message: `未找到符合的檔案。\n` +
                `搜尋路徑: ${projectPath}\n` +
                `搜尋的檔案:\n${filePatterns.join('\n')}` +
                (errors.length ? `\n\n錯誤:\n${errors.join('\n')}` : '')
      };
    }
  } catch (error) {
    console.error('Global error:', error);
    return {
      success: false,
      message: `執行時發生錯誤: ${error.message}`
    };
  }
});
