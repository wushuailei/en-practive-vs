import * as vscode from 'vscode';
import { PluginSettings, WordBookInfo, PracticeMode } from './types';
import { getSettings, updateSetting } from './settings';
import { getStoredWordBooks } from './wordbooks';
import { PracticeWebviewProvider } from './practiceProvider';

export function showSettingsPanel(context: vscode.ExtensionContext, practiceProvider: PracticeWebviewProvider) {
    // 创建设置面板
    const panel = vscode.window.createWebviewPanel(
        'enpractice.settings',
        'English Practice Settings',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    let currentWordBooks: WordBookInfo[] = [];
    
    // 更新HTML内容的函数
    async function updateWebviewContent() {
        try {
            currentWordBooks = await getStoredWordBooks(context);
            const settings = await getSettings(context);
            panel.webview.html = getSettingsWebviewContentWithData(currentWordBooks, settings);
        } catch (error) {
            console.error('获取数据失败:', error);
            const defaultSettings = await getSettings(context);
            panel.webview.html = getSettingsWebviewContentWithData([], defaultSettings);
        }
    }
    
    // 初始化加载
    updateWebviewContent();

    // 监听来自 webview 的消息
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'refreshWordBooks':
                    await updateWebviewContent();
                    break;
                case 'switchWordBook':
                    await practiceProvider.switchStoredWordBook(context, message.bookId);
                    vscode.window.showInformationMessage(`已切换词书`);
                    // 刷新设置页面以显示最新状态
                    await updateWebviewContent();
                    break;
                case 'updateChapterLoop':
                    await updateSetting(context, 'chapterLoop', message.chapterLoop);
                    // 同步更新练习提供者的设置
                    await practiceProvider.updateChapterLoopSetting(message.chapterLoop);
                    vscode.window.showInformationMessage(message.chapterLoop ? '已开启单章循环' : '已关闭单章循环');
                    // 刷新设置页面以显示最新状态
                    await updateWebviewContent();
                    break;
                case 'updatePracticeMode':
                    await updateSetting(context, 'practiceMode', message.practiceMode);
                    // 同步更新练习提供者的设置
                    await practiceProvider.updatePracticeMode(message.practiceMode);
                    const modeText = message.practiceMode === 'normal' ? '正常模式' : '默写模式';
                    vscode.window.showInformationMessage(`已切换到${modeText}`);
                    // 刷新设置页面以显示最新状态
                    await updateWebviewContent();
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getSettingsWebviewContentWithData(wordBooks: WordBookInfo[], settings: PluginSettings): string {
    let wordbookListHtml = '';
    
    if (!wordBooks || wordBooks.length === 0) {
        wordbookListHtml = '<div class="loading">暂无词书文件，请在data目录中添加词书文件</div>';
    } else {
        wordbookListHtml = wordBooks.map(book => {
            const isCurrentBook = book.id === settings.currentWordbook;
            let bookInfo = `<strong>${book.name || '未知词书'}</strong>`;
            if (isCurrentBook) {
                bookInfo += ' <span style="color: var(--vscode-charts-green); font-size: 12px;">[当前使用]</span>';
            }
            bookInfo += '<br>';
            if (book.description) {
                bookInfo += `<small>${book.description}</small><br>`;
            }
            if (book.length) {
                bookInfo += `<small>单词数量: ${book.length}</small><br>`;
            }
            if (book.category) {
                bookInfo += `<small>类别: ${book.category}</small><br>`;
            }
            if (book.tags && book.tags.length > 0) {
                bookInfo += `<small>标签: ${book.tags.join(', ')}</small>`;
            }
            
            const bookId = book.id || 'unknown';
            const buttonText = isCurrentBook ? '当前使用' : '切换';
            const buttonDisabled = isCurrentBook ? 'disabled' : '';
            const buttonClass = isCurrentBook ? 'switch-btn current' : 'switch-btn';
            
            return `<div class="wordbook-item ${isCurrentBook ? 'current' : ''}">
                        <div class="wordbook-info">${bookInfo}</div>
                        <div class="wordbook-actions">
                            <button class="${buttonClass}" onclick="vscode.postMessage({command: 'switchWordBook', bookId: '${bookId}'}); return false;" ${buttonDisabled}>${buttonText}</button>
                        </div>
                    </div>`;
        }).join('');
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>English Practice Settings</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        
        h1 {
            color: var(--vscode-foreground);
            margin-bottom: 30px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 10px;
        }
        
        .section {
            margin-bottom: 30px;
            padding: 20px;
            background-color: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
        }
        
        .section h3 {
            margin-top: 0;
            color: var(--vscode-foreground);
        }
        
        .wordbook-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 15px;
        }
        
        .wordbook-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            margin-bottom: 8px;
            transition: background-color 0.2s;
        }
        
        .wordbook-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .wordbook-item.current {
            background-color: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-focusBorder);
        }
        
        .wordbook-info {
            flex: 1;
        }
        
        .wordbook-actions {
            display: flex;
            gap: 5px;
        }
        
        .switch-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .switch-btn:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .switch-btn.current {
            background-color: var(--vscode-charts-green);
            cursor: default;
        }
        
        .switch-btn:disabled {
            opacity: 0.7;
            cursor: default;
        }
        
        .setting-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
            padding: 10px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        
        .setting-label {
            flex: 1;
            font-weight: bold;
        }
        
        .setting-control {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .setting-input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 2px;
            width: 80px;
        }
        
        .setting-select {
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            border-radius: 2px;
        }
        
        .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
        }
        
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .description {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            margin-bottom: 15px;
        }
        
        .loading {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 20px;
        }
    </style>
    <script>
        const vscode = acquireVsCodeApi();
    </script>
</head>
<body>
    <div class="container">
        <h1>English Practice Settings</h1>
        
        <div class="section">
            <h3>词书管理</h3>
            <div class="description">管理您的词书文件，支持上传、切换和删除操作。</div>
            
            <div style="margin-bottom: 15px;">
                <button class="button secondary" onclick="vscode.postMessage({command: 'refreshWordBooks'}); return false;">🔄 刷新列表</button>
            </div>
            
            <div class="wordbook-list" id="wordbookList">
                ${wordbookListHtml}
            </div>
        </div>
        
        <div class="section">
            <h3>练习设置</h3>
            <div class="description">配置您的学习参数和偏好。</div>
            
            <div class="setting-item">
                <div class="setting-label">练习模式</div>
                <div class="setting-control">
                    <select id="practiceModeSelect" 
                            onchange="vscode.postMessage({command: 'updatePracticeMode', practiceMode: this.value}); return false;"
                            style="background-color: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); padding: 4px 8px; border-radius: 2px;">
                        <option value="normal" ${settings.practiceMode === 'normal' ? 'selected' : ''}>正常模式（显示单词）</option>
                        <option value="dictation" ${settings.practiceMode === 'dictation' ? 'selected' : ''}>默写模式（仅显示翻译）</option>
                    </select>
                </div>
            </div>
            
            <div class="setting-item">
                <div class="setting-label">每章单词数</div>
                <div class="setting-control">
                    <span style="color: var(--vscode-charts-green);">10 个（固定）</span>
                </div>
            </div>
            

            <div class="setting-item">
                <div class="setting-label">单章循环</div>
                <div class="setting-control">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="chapterLoopCheckbox" 
                               onchange="vscode.postMessage({command: 'updateChapterLoop', chapterLoop: this.checked}); return false;" 
                               ${settings.chapterLoop ? 'checked' : ''} 
                               style="margin: 0;">
                        <span style="font-size: 13px;">${settings.chapterLoop ? '已开启' : '已关闭'}</span>
                    </label>
                </div>
            </div>
            
            <div class="setting-item">
                <div class="setting-label">当前词书</div>
                <div class="setting-control">
                    <span style="color: var(--vscode-charts-green);">${wordBooks.find(b => b.id === settings.currentWordbook)?.name || '未选择'}</span>
                </div>
            </div>
            
            <div class="setting-item">
                <div class="setting-label">最后更新</div>
                <div class="setting-control">
                    <span>${settings.lastUpdated}</span>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h3>关于</h3>
            <div class="description">
                English Practice v0.0.1<br>
                一个简单的VS Code英语单词练习插件。<br>
                支持自定义词书，实时输入校验和动效反馈。
            </div>
        </div>
    </div>
</body>
</html>`;
}