import * as vscode from 'vscode';

export class DataViewerProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private onDidResetData: (() => void) | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // 设置数据重置后的回调函数
    public setOnDidResetDataCallback(callback: () => void) {
        this.onDidResetData = callback;
    }

    public show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'enpractice.dataViewer',
            'EnPractice Data Viewer',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refreshData':
                        await this.sendStoredData();
                        break;
                    case 'resetData':
                        await this.resetAllData();
                        // 重置后刷新数据
                        await this.sendStoredData();
                        // 调用回调函数刷新练习面板
                        if (this.onDidResetData) {
                            this.onDidResetData();
                        }
                        break;
                    case 'exportData':
                        await this.exportData();
                        break;
                    case 'importData':
                        await this.importData(message.data);
                        // 导入后刷新数据
                        await this.sendStoredData();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 发送初始数据
        this.sendStoredData();
    }

    private async sendStoredData() {
        try {
            // 获取所有存储的键
            const keys = this.context.globalState.keys();
            
            // 构建显示信息
            const dataInfo: any = {};
            
            // 获取所有键对应的数据
            for (const key of keys) {
                try {
                    const data = this.context.globalState.get(key);
                    dataInfo[key] = data;
                } catch (error) {
                    dataInfo[key] = `读取数据失败: ${error}`;
                }
            }
            
            this.panel?.webview.postMessage({
                command: 'updateData',
                data: dataInfo
            });
        } catch (error) {
            console.error('获取存储数据失败:', error);
        }
    }

    // 重置所有数据
    private async resetAllData() {
        try {
            // 获取所有存储的键
            const keys = this.context.globalState.keys();
            
            // 删除所有与EnPractice相关的数据
            for (const key of keys) {
                if (key.startsWith('enpractice.')) {
                    await this.context.globalState.update(key, undefined);
                }
            }
            
            // 添加今天的记录到 totalRecords
            const today = new Date().toISOString().split('T')[0];
            const totalRecordKey = 'enpractice.dayRecords.totalRecords';
            const totalRecords = [{
                date: today,
                analysisGenerated: false
            }];
            
            await this.context.globalState.update(totalRecordKey, totalRecords);
            
            // 显示成功消息
            vscode.window.showInformationMessage('所有练习数据已重置');
        } catch (error) {
            console.error('重置数据失败:', error);
            vscode.window.showErrorMessage('重置数据失败: ' + error);
        }
    }

    // 导出数据
    private async exportData() {
        try {
            // 获取所有存储的键
            const keys = this.context.globalState.keys();
            
            // 构建导出数据
            const exportData: any = {};
            
            // 获取所有键对应的数据
            for (const key of keys) {
                if (key.startsWith('enpractice.')) {
                    try {
                        const data = this.context.globalState.get(key);
                        exportData[key] = data;
                    } catch (error) {
                        console.error(`导出数据失败: ${key}`, error);
                    }
                }
            }
            
            // 创建导出文件
            const exportContent = JSON.stringify(exportData, null, 2);
            const fileName = `enpractice-export-${new Date().toISOString().split('T')[0]}.json`;
            
            // 保存文件
            const uri = await vscode.window.showSaveDialog({
                filters: { 'JSON': ['json'] },
                defaultUri: vscode.Uri.file(fileName)
            });
            
            if (uri) {
                const buffer = Buffer.from(exportContent, 'utf8');
                await vscode.workspace.fs.writeFile(uri, buffer);
                vscode.window.showInformationMessage(`数据已导出到: ${uri.fsPath}`);
            }
        } catch (error) {
            console.error('导出数据失败:', error);
            vscode.window.showErrorMessage('导出数据失败: ' + error);
        }
    }

    // 导入数据
    private async importData(importContent: string) {
        try {
            // 解析导入的数据
            const importData = JSON.parse(importContent);
            
            // 确认是否要导入数据
            const confirm = await vscode.window.showWarningMessage(
                '导入数据将覆盖现有数据，是否继续？',
                { modal: true },
                '是',
                '否'
            );
            
            if (confirm !== '是') {
                return;
            }
            
            // 删除所有现有的EnPractice数据
            const keys = this.context.globalState.keys();
            for (const key of keys) {
                if (key.startsWith('enpractice.')) {
                    await this.context.globalState.update(key, undefined);
                }
            }
            
            // 导入新数据
            for (const [key, value] of Object.entries(importData)) {
                if (key.startsWith('enpractice.')) {
                    await this.context.globalState.update(key, value);
                }
            }
            
            // 显示成功消息
            vscode.window.showInformationMessage('数据导入成功');
        } catch (error) {
            console.error('导入数据失败:', error);
            vscode.window.showErrorMessage('导入数据失败: ' + error);
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EnPractice Data Viewer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        
        .header h1 {
            margin: 0;
        }
        
        .header-buttons {
            display: flex;
            gap: 10px;
        }
        
        .refresh-btn, .reset-btn, .export-btn, .import-btn {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-background);
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
        }
        
        .reset-btn {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-color: var(--vscode-inputValidation-errorBorder);
        }
        
        .export-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .import-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .refresh-btn:hover, .export-btn:hover, .import-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .reset-btn:hover {
            background-color: var(--vscode-inputValidation-errorBackground);
            opacity: 0.8;
        }
        
        .data-container {
            background-color: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .data-item {
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-editor-widget-border);
        }
        
        .data-item:last-child {
            margin-bottom: 0;
            padding-bottom: 0;
            border-bottom: none;
        }
        
        .data-key {
            font-weight: bold;
            color: var(--vscode-foreground);
            margin-bottom: 5px;
            display: flex;
            justify-content: space-between;
        }
        
        .data-value {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            border-radius: 4px;
            padding: 10px;
            font-family: monospace;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .no-data {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px;
        }
        
        .search-box {
            margin-bottom: 20px;
        }
        
        .search-input {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 14px;
        }
        
        .search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .filter-buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .filter-btn {
            padding: 6px 12px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        
        .filter-btn.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .filter-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .filter-btn.active:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .confirmation-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            min-width: 300px;
        }
        
        .dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 999;
        }
        
        .dialog-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }
        
        .dialog-btn {
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        
        .confirm-btn {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }
        
        .cancel-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-background);
        }
        
        .confirm-btn:hover {
            opacity: 0.8;
        }
        
        .cancel-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .file-input {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 EnPractice 数据查看器</h1>
            <div class="header-buttons">
                <button class="import-btn" id="importBtn">📥 导入数据</button>
                <button class="export-btn" id="exportBtn">📤 导出数据</button>
                <button class="reset-btn" id="resetBtn">🗑️ 重置数据</button>
                <button class="refresh-btn" id="refreshBtn">🔄 刷新数据</button>
            </div>
        </div>
        
        <input type="file" id="fileInput" class="file-input" accept=".json">
        
        <div class="search-box">
            <input type="text" id="searchInput" class="search-input" placeholder="搜索键名...">
        </div>
        
        <div class="filter-buttons">
            <button class="filter-btn active" data-filter="all">全部数据</button>
            <button class="filter-btn" data-filter="dayRecords">每日记录</button>
            <button class="filter-btn" data-filter="analysis">分析数据</button>
            <button class="filter-btn" data-filter="records">练习记录</button>
            <button class="filter-btn" data-filter="settings">设置数据</button>
        </div>
        
        <div id="dataContainer" class="data-container">
            <div class="no-data">加载中...</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateData':
                    renderData(message.data);
                    break;
            }
        });
        
        // 刷新数据
        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'refreshData' });
        });
        
        // 重置数据
        document.getElementById('resetBtn').addEventListener('click', () => {
            showConfirmationDialog();
        });
        
        // 导出数据
        document.getElementById('exportBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'exportData' });
        });
        
        // 导入数据
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        
        // 文件选择处理
        document.getElementById('fileInput').addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const content = e.target.result;
                    vscode.postMessage({ command: 'importData', data: content });
                };
                reader.readAsText(file);
            }
            // 重置文件输入
            event.target.value = '';
        });
        
        // 搜索功能
        document.getElementById('searchInput').addEventListener('input', filterData);
        
        // 过滤按钮
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                // 更新激活状态
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                filterData();
            });
        });
        
        // 存储所有数据用于过滤
        let allData = {};
        
        // 渲染数据
        function renderData(data) {
            allData = data;
            filterData();
        }
        
        // 过滤数据
        function filterData() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
            
            // 过滤数据
            const filteredData = {};
            for (const [key, value] of Object.entries(allData)) {
                // 应用搜索过滤
                if (searchTerm && !key.toLowerCase().includes(searchTerm)) {
                    continue;
                }
                
                // 应用类型过滤
                let shouldInclude = false;
                switch (activeFilter) {
                    case 'all':
                        shouldInclude = true;
                        break;
                    case 'dayRecords':
                        shouldInclude = key.startsWith('enpractice.dayRecords') && !key.includes('analysis');
                        break;
                    case 'analysis':
                        shouldInclude = key.includes('analysis');
                        break;
                    case 'records':
                        shouldInclude = key.startsWith('enpractice.records');
                        break;
                    case 'settings':
                        shouldInclude = key.includes('settings');
                        break;
                }
                
                if (shouldInclude) {
                    filteredData[key] = value;
                }
            }
            
            // 渲染过滤后的数据
            const container = document.getElementById('dataContainer');
            if (Object.keys(filteredData).length === 0) {
                container.innerHTML = '<div class="no-data">没有找到匹配的数据</div>';
                return;
            }
            
            let html = '';
            for (const [key, value] of Object.entries(filteredData)) {
                html += \`
                    <div class="data-item">
                        <div class="data-key">
                            <span>\${key}</span>
                        </div>
                        <div class="data-value">\${formatData(value)}</div>
                    </div>
                \`;
            }
            container.innerHTML = html;
        }
        
        // 格式化数据用于显示
        function formatData(data) {
            if (typeof data === 'string') {
                try {
                    // 尝试解析JSON字符串
                    const parsed = JSON.parse(data);
                    return JSON.stringify(parsed, null, 2);
                } catch {
                    // 如果不是JSON，直接返回
                    return data;
                }
            } else {
                // 对于对象或其他类型，转换为JSON字符串
                return JSON.stringify(data, null, 2);
            }
        }
        
        // 显示确认对话框
        function showConfirmationDialog() {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';
            overlay.id = 'dialogOverlay';
            
            // 创建对话框
            const dialog = document.createElement('div');
            dialog.className = 'confirmation-dialog';
            dialog.innerHTML = \`
                <h3>确认重置数据</h3>
                <p>您确定要重置所有练习数据吗？此操作无法撤销。</p>
                <div class="dialog-buttons">
                    <button class="dialog-btn cancel-btn" id="cancelReset">取消</button>
                    <button class="dialog-btn confirm-btn" id="confirmReset">确认重置</button>
                </div>
            \`;
            
            // 添加到页面
            document.body.appendChild(overlay);
            document.body.appendChild(dialog);
            
            // 添加事件监听器
            document.getElementById('cancelReset').addEventListener('click', hideConfirmationDialog);
            document.getElementById('confirmReset').addEventListener('click', resetAllData);
            overlay.addEventListener('click', hideConfirmationDialog);
        }
        
        // 隐藏确认对话框
        function hideConfirmationDialog() {
            const overlay = document.getElementById('dialogOverlay');
            const dialog = document.querySelector('.confirmation-dialog');
            
            if (overlay) overlay.remove();
            if (dialog) dialog.remove();
        }
        
        // 重置所有数据
        function resetAllData() {
            hideConfirmationDialog();
            vscode.postMessage({ command: 'resetData' });
        }
        
        // 初始化
        vscode.postMessage({ command: 'refreshData' });
    </script>
</body>
</html>`;
    }
}