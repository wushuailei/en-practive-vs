import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DayRecordManager } from './dayRecordManager';

export class DataAnalysisProvider {
    private panel: vscode.WebviewPanel | undefined;
    private dayRecordManager: DayRecordManager;

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.dayRecordManager = new DayRecordManager(context);
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
                case 'generateTodayData':
                    await this.generateTodayData();
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
            const snapshotDir = path.join(this.context.extensionPath, 'data', 'userdata', 'snapshots');
            const snapshotPath = path.join(snapshotDir, `${date}.json`);

            let data = null;
            if (fs.existsSync(snapshotPath)) {
                const content = fs.readFileSync(snapshotPath, 'utf-8');
                data = JSON.parse(content);
            }

            this.panel.webview.postMessage({
                type: 'dateData',
                date: date,
                data: data
            });

        } catch (error) {
            console.error(`发送日期数据失败: ${date}`, error);
        }
    }

    private async generateTodayData() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // 创建快照数据文件夹
            const snapshotDir = path.join(this.context.extensionPath, 'data', 'userdata', 'snapshots');
            if (!fs.existsSync(snapshotDir)) {
                fs.mkdirSync(snapshotDir, { recursive: true });
            }
            
            // 获取当日记录数据
            const normalRecord = await this.dayRecordManager.getDayRecord(today, 'normal');
            const dictationRecord = await this.dayRecordManager.getDayRecord(today, 'dictation');
            
            // 创建基于单词的快照数据结构
            const snapshot: any = {
                date: today,
                generatedAt: new Date().toISOString(),
                modes: {
                    normal: {
                        words: [],
                        totalWords: 0
                    },
                    dictation: {
                        words: [],
                        totalWords: 0
                    }
                },
                totalStats: {
                    totalWordsNormal: 0,
                    totalWordsDictation: 0,
                    totalWordsAll: 0
                }
            };

            // 处理正常模式数据
            if (normalRecord && normalRecord.dicts) {
                const normalWords: any[] = [];
                
                Object.entries(normalRecord.dicts).forEach(([dictId, dict]: [string, any]) => {
                    Object.entries(dict.chapters).forEach(([chapterNum, chapter]: [string, any]) => {
                        if (chapter.words && Array.isArray(chapter.words)) {
                            chapter.words.forEach((wordName: string) => {
                                // 获取单词的练习记录（从records文件夹）
                                const wordData = this.getWordPracticeRecord(dictId, parseInt(chapterNum), wordName, 'normal');
                                
                                normalWords.push({
                                    word: wordName,
                                    dictId: dictId,
                                    dictName: dict.dictName,
                                    chapter: parseInt(chapterNum),
                                    chapterName: `第${chapterNum}章`,
                                    practiceRecord: wordData,
                                    practicedToday: true
                                });
                            });
                        }
                    });
                });
                
                snapshot.modes.normal.words = normalWords;
                snapshot.modes.normal.totalWords = normalWords.length;
                snapshot.totalStats.totalWordsNormal = normalWords.length;
            }

            // 处理默写模式数据
            if (dictationRecord && dictationRecord.dicts) {
                const dictationWords: any[] = [];
                
                Object.entries(dictationRecord.dicts).forEach(([dictId, dict]: [string, any]) => {
                    Object.entries(dict.chapters).forEach(([chapterNum, chapter]: [string, any]) => {
                        if (chapter.words && Array.isArray(chapter.words)) {
                            chapter.words.forEach((wordName: string) => {
                                // 获取单词的练习记录（从records文件夹）
                                const wordData = this.getWordPracticeRecord(dictId, parseInt(chapterNum), wordName, 'dictation');
                                
                                dictationWords.push({
                                    word: wordName,
                                    dictId: dictId,
                                    dictName: dict.dictName,
                                    chapter: parseInt(chapterNum),
                                    chapterName: `第${chapterNum}章`,
                                    practiceRecord: wordData,
                                    practicedToday: true
                                });
                            });
                        }
                    });
                });
                
                snapshot.modes.dictation.words = dictationWords;
                snapshot.modes.dictation.totalWords = dictationWords.length;
                snapshot.totalStats.totalWordsDictation = dictationWords.length;
            }
            
            // 计算总单词数
            snapshot.totalStats.totalWordsAll = snapshot.totalStats.totalWordsNormal + snapshot.totalStats.totalWordsDictation;

            // 保存快照文件
            const snapshotPath = path.join(snapshotDir, `${today}.json`);
            fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

            // 刷新数据显示
            await this.sendDateList();
            await this.sendDateData(today);

            vscode.window.showInformationMessage(`✅ 已生成 ${today} 的单词级快照数据`);

        } catch (error) {
            console.error('Error generating today data:', error);
            vscode.window.showErrorMessage('生成今日数据失败: ' + error);
        }
    }

    // 获取单词的练习记录
    private getWordPracticeRecord(dictId: string, chapter: number, word: string, mode: string): any {
        try {
            // 使用 globalState 获取记录
            const recordKey = `enpractice.records.${dictId}.${mode}.ch${chapter}`;
            const chapterRecord = this.context.globalState.get<any>(recordKey);
            
            if (chapterRecord && chapterRecord.wordRecords && chapterRecord.wordRecords[word]) {
                return chapterRecord.wordRecords[word];
            }
            
            // 如果没有找到记录，返回默认值
            return {
                word: word,
                practiceCount: 0,
                correctCount: 0,
                errorCount: 0,
                correctRate: 0,
                lastPracticeTime: '从未练习'
            };
        } catch (error) {
            console.error(`获取单词练习记录失败 (${dictId}, ${chapter}, ${word}):`, error);
            return {
                word: word,
                practiceCount: 0,
                correctCount: 0,
                errorCount: 0,
                correctRate: 0,
                lastPracticeTime: '从未练习'
            };
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
                <button class="button" id="generateTodayBtn">生成今日数据</button>
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
                
                // 页面加载时请求日期列表
                window.addEventListener('load', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 刷新按钮
                document.getElementById('refreshBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 生成今日数据按钮
                document.getElementById('generateTodayBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'generateTodayData' });
                });
                
                // 日期选择器变化
                document.getElementById('dateSelector').addEventListener('change', (e) => {
                    const selectedDate = e.target.value;
                    if (selectedDate) {
                        vscode.postMessage({ type: 'requestDateData', date: selectedDate });
                    }
                });
                
                // 模式切换
                document.querySelectorAll('.mode-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        // 可以在这里添加模式切换的逻辑
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
                    
                    // 构建统计信息
                    const statsHtml = \`
                        <div class="stats-container">
                            <div class="stat-card">
                                <div class="stat-title">今日练习单词数</div>
                                <div class="stat-value">\${data.totalStats.totalWordsAll}</div>
                                <div class="stat-detail">正常模式: \${data.totalStats.totalWordsNormal} | 默写模式: \${data.totalStats.totalWordsDictation}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-title">词典数量</div>
                                <div class="stat-value">\${data.modes.normal.words.length > 0 ? new Set(data.modes.normal.words.map(w => w.dictId)).size : 0}</div>
                                <div class="stat-detail">不同词典的练习记录</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-title">章节数量</div>
                                <div class="stat-value">\${data.modes.normal.words.length > 0 ? new Set(data.modes.normal.words.map(w => \`\${w.dictId}-\${w.chapter}\`)).size : 0}</div>
                                <div class="stat-detail">不同章节的练习记录</div>
                            </div>
                        </div>
                    \`;
                    
                    // 构建单词列表
                    let wordsHtml = '';
                    if (data.modes.normal.words.length > 0 || data.modes.dictation.words.length > 0) {
                        wordsHtml = \`
                            <div class="words-container">
                                <div class="words-header">
                                    <span>今日练习单词</span>
                                    <span>\${data.modes.normal.words.length + data.modes.dictation.words.length} 个单词</span>
                                </div>
                                <div class="words-list">
                                    \${data.modes.normal.words.map(word => \`
                                        <div class="word-item">
                                            <div class="word-name">\${word.word}</div>
                                            <div class="word-dict">\${word.dictName}</div>
                                            <div class="word-chapter">\${word.chapterName}</div>
                                            <div class="word-stats">练习次数: \${word.practiceRecord.practiceCount} | 正确率: \${Math.round(word.practiceRecord.correctRate)}%</div>
                                        </div>
                                    \`).join('')}
                                    \${data.modes.dictation.words.map(word => \`
                                        <div class="word-item">
                                            <div class="word-name">\${word.word}</div>
                                            <div class="word-dict">\${word.dictName}</div>
                                            <div class="word-chapter">\${word.chapterName}</div>
                                            <div class="word-stats">练习次数: \${word.practiceRecord.practiceCount} | 正确率: \${Math.round(word.practiceRecord.correctRate)}%</div>
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
            </script>
        </body>
        </html>`;
    }
}