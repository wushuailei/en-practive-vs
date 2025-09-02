import * as vscode from 'vscode';
import { DayRecordManager } from './dayRecordManager';
import { DayAnalysisManager } from './dayAnalysisManager';

export class DataAnalysisProvider {
    private panel: vscode.WebviewPanel | undefined;
    private dayRecordManager: DayRecordManager;
    private dayAnalysisManager: DayAnalysisManager;

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.dayRecordManager = new DayRecordManager(context);
        this.dayAnalysisManager = new DayAnalysisManager(context);
    }

    public show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'enpractice.dataAnalysis',
            'English Practice Analysis',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'requestDateList':
                    await this.sendDateList();
                    break;
                case 'requestDateData':
                    await this.sendDateData(data.date);
                    break;
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 初始化时发送日期列表
        this.sendDateList();
    }

    private async sendDateList() {
        if (!this.panel) return;

        try {
            // 从 globalState 获取日期列表
            const totalRecords = await this.dayRecordManager.getTotalRecords();
            
            // 从 totalRecords 中提取日期并排序
            const dates = totalRecords
                .map((record: any) => record.date)
                .sort((a: string, b: string) => b.localeCompare(a)); // 降序排列，最新的在前

            this.panel.webview.postMessage({
                type: 'dateList',
                dates: dates
            });

        } catch (error) {
            console.error('发送日期列表失败:', error);
        }
    }

    private async sendDateData(date: string) {
        if (!this.panel) return;

        try {
            // 直接从每日记录获取数据，而不是从快照数据获取
            const normalRecord = await this.dayRecordManager.getDayRecord(date, 'normal');
            const dictationRecord = await this.dayRecordManager.getDayRecord(date, 'dictation');

            // 构建数据结构
            const data: any = {
                date: date,
                modes: {
                    normal: {
                        words: normalRecord ? normalRecord.words : []
                    },
                    dictation: {
                        words: dictationRecord ? dictationRecord.words : []
                    }
                }
            };

            this.panel.webview.postMessage({
                type: 'dateData',
                date: date,
                data: data
            });

        } catch (error) {
            console.error(`发送日期数据失败: ${date}`, error);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>English Practice Analysis</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 10px;
                }
                
                .header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .date-selector {
                    flex: 1;
                }
                
                select {
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 4px 8px;
                    border-radius: 2px;
                    min-width: 120px;
                }
                
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 13px;
                }
                
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .stats-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }
                
                .stat-card {
                    background-color: var(--vscode-editor-widget-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 15px;
                }
                
                .stat-title {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-foreground);
                }
                
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-charts-green);
                }
                
                .stat-detail {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                
                .words-container {
                    background-color: var(--vscode-editor-widget-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 15px;
                }
                
                .words-header {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-foreground);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .words-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 10px;
                }
                
                .word-item {
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 8px;
                    font-size: 13px;
                }
                
                .word-name {
                    font-weight: bold;
                    color: var(--vscode-foreground);
                    margin-bottom: 4px;
                }
                
                .word-dict {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 2px;
                }
                
                .word-chapter {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 4px;
                }
                
                .word-stats {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .empty-state {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    padding: 40px 20px;
                }
                
                .mode-tabs {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }
                
                .mode-tab {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                }
                
                .mode-tab.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>📊 数据分析</h2>
                <div class="date-selector">
                    <select id="dateSelector">
                        <option value="">选择日期</option>
                    </select>
                </div>
                <button class="button" id="refreshBtn">🔄 刷新</button>
            </div>
            
            <div class="mode-tabs">
                <button class="mode-tab active" data-mode="normal">📝 正常模式</button>
                <button class="mode-tab" data-mode="dictation">✏️ 默写模式</button>
                <button class="mode-tab" data-mode="all">📈 全部数据</button>
            </div>
            
            <div id="content">
                <div class="loading">加载中...</div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // 当前选择的模式
                let currentMode = 'normal';
                // 当前显示的数据
                let currentData = null;
                // 当前选择的日期
                let selectedDate = '';
                
                // 页面加载时请求日期列表
                window.addEventListener('load', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 刷新按钮
                document.getElementById('refreshBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 日期选择器变化
                document.getElementById('dateSelector').addEventListener('change', (e) => {
                    selectedDate = e.target.value;
                    if (selectedDate) {
                        vscode.postMessage({ type: 'requestDateData', date: selectedDate });
                    }
                });
                
                // 模式切换
                document.querySelectorAll('.mode-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        currentMode = tab.dataset.mode;
                        // 更新内容显示
                        if (currentData) {
                            updateContent(currentData);
                        }
                    });
                });
                
                // 接收来自扩展的消息
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'dateList':
                            updateDateSelector(message.dates);
                            break;
                        case 'dateData':
                            currentData = message.data;
                            updateContent(message.data);
                            break;
                    }
                });
                
                function updateDateSelector(dates) {
                    const selector = document.getElementById('dateSelector');
                    selector.innerHTML = '<option value="">选择日期</option>';
                    
                    dates.forEach(date => {
                        const option = document.createElement('option');
                        option.value = date;
                        option.textContent = date;
                        selector.appendChild(option);
                    });
                }
                
                function updateContent(data) {
                    const content = document.getElementById('content');
                    
                    if (!data) {
                        content.innerHTML = '<div class="empty-state">暂无数据</div>';
                        return;
                    }
                    
                    // 根据当前模式过滤数据
                    let normalWords = data.modes.normal.words || [];
                    let dictationWords = data.modes.dictation.words || [];
                    let displayWords = [];
                    
                    switch (currentMode) {
                        case 'normal':
                            displayWords = normalWords;
                            break;
                        case 'dictation':
                            displayWords = dictationWords;
                            break;
                        case 'all':
                        default:
                            displayWords = [...normalWords, ...dictationWords];
                            break;
                    }
                    
                    // 构建统计信息
                    const statsHtml = \`
                        <div class="stats-container">
                            <div class="stat-card">
                                <div class="stat-title">今日练习单词数</div>
                                <div class="stat-value">\${displayWords.length}</div>
                                <div class="stat-detail">正常模式: \${normalWords.length} | 默写模式: \${dictationWords.length}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-title">词典数量</div>
                                <div class="stat-value">\${displayWords.length > 0 ? new Set(displayWords.map(w => w.dictId)).size : 0}</div>
                                <div class="stat-detail">不同词典的练习记录</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-title">章节数量</div>
                                <div class="stat-value">\${displayWords.length > 0 ? new Set(displayWords.map(w => \`\${w.dictId}-\${w.chapterNumber}\`)).size : 0}</div>
                                <div class="stat-detail">不同章节的练习记录</div>
                            </div>
                        </div>
                    \`;
                    
                    // 构建单词列表
                    let wordsHtml = '';
                    if (displayWords.length > 0) {
                        wordsHtml = \`
                            <div class="words-container">
                                <div class="words-header">
                                    <span>今日练习单词</span>
                                    <span>\${displayWords.length} 个单词</span>
                                </div>
                                <div class="words-list">
                                    \${displayWords.map(word => \`
                                        <div class="word-item">
                                            <div class="word-name">\${word.word}</div>
                                            <div class="word-dict">\${word.dictName}</div>
                                            <div class="word-chapter">章节 \${word.chapterNumber}</div>
                                            <div class="word-stats">练习时间: \${formatTime(word.practiceTime)}</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        \`;
                    } else {
                        wordsHtml = '<div class="empty-state">今日暂无练习记录</div>';
                    }
                    
                    content.innerHTML = statsHtml + wordsHtml;
                }
                
                // 格式化时间显示
                function formatTime(timeString) {
                    try {
                        const date = new Date(timeString);
                        return \`\${date.getMonth() + 1}-\${date.getDate()} \${date.getHours().toString().padStart(2, '0')}:\${date.getMinutes().toString().padStart(2, '0')}\`;
                    } catch (error) {
                        return '未知时间';
                    }
                }
            </script>
        </body>
        </html>`;
    }
}