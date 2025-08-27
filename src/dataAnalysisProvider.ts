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
            const snapshotDir = path.join(this.context.extensionPath, 'data', 'userdata', 'snapshots');
            let dates: string[] = [];

            if (fs.existsSync(snapshotDir)) {
                const files = fs.readdirSync(snapshotDir);
                dates = files
                    .filter(f => f.endsWith('.json'))
                    .map(f => f.replace('.json', ''))
                    .sort((a, b) => b.localeCompare(a)); // 降序排列，最新的在前
            }

            this.panel.webview.postMessage({
                type: 'dateList',
                dates: dates
            });

            console.log('📅 发送日期列表:', dates);
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

            console.log(`📊 发送日期数据: ${date}`, data ? '有数据' : '无数据');
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

            // 计算总计
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
            const recordsDir = path.join(this.context.extensionPath, 'data', 'userdata', 'records');
            const chapterFile = `${dictId}_${mode}_ch${chapter}.json`;
            const chapterPath = path.join(recordsDir, chapterFile);
            
            if (fs.existsSync(chapterPath)) {
                const content = fs.readFileSync(chapterPath, 'utf-8');
                const chapterData = JSON.parse(content);
                
                if (chapterData.wordRecords && chapterData.wordRecords[word]) {
                    return chapterData.wordRecords[word];
                }
            }
            
            // 返回默认记录
            return {
                word: word,
                practiceCount: 0,
                correctCount: 0,
                errorCount: 0,
                correctRate: 0,
                lastPracticeTime: '从未练习'
            };
        } catch (error) {
            console.error(`获取单词练习记录失败: ${word}`, error);
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
                    padding: 5px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 3px;
                }
                
                .generate-btn {
                    padding: 5px 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                .generate-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .generate-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .stats-overview {
                    margin-bottom: 20px;
                    padding: 15px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 5px;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 15px;
                    margin-top: 10px;
                }
                
                .stat-item {
                    text-align: center;
                    padding: 10px;
                    background-color: var(--vscode-input-background);
                    border-radius: 3px;
                }
                
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                
                .stat-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                
                .modes-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-top: 20px;
                }
                
                .mode-section {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 5px;
                    padding: 15px;
                }
                
                .mode-section h3 {
                    margin: 0 0 15px 0;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .filters-container {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                    flex-wrap: wrap;
                }
                
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }
                
                .filter-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .filter-select {
                    padding: 4px 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 3px;
                    font-size: 12px;
                }
                
                .words-table {
                    overflow-x: auto;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                
                th, td {
                    padding: 8px;
                    text-align: left;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                th {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    font-weight: bold;
                    position: sticky;
                    top: 0;
                }
                
                .word-name {
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                
                tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .no-data {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <select id="date-selector" class="date-selector">
                    <option value="">选择日期...</option>
                </select>
                <button id="generate-btn" class="generate-btn" disabled>生成今日数据</button>
            </div>
            
            <div id="data-content" class="loading">
                正在加载数据...
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                vscode.postMessage({ type: 'requestDateList' });
                
                const dateSelector = document.getElementById('date-selector');
                const generateBtn = document.getElementById('generate-btn');
                
                dateSelector.addEventListener('change', function() {
                    const selectedDate = this.value;
                    if (selectedDate) {
                        vscode.postMessage({ 
                            type: 'requestDateData', 
                            date: selectedDate 
                        });
                        
                        const today = new Date().toISOString().split('T')[0];
                        generateBtn.disabled = selectedDate !== today;
                    } else {
                        document.getElementById('data-content').innerHTML = '<div class="no-data">请选择一个日期查看数据</div>';
                        generateBtn.disabled = true;
                    }
                });
                
                generateBtn.addEventListener('click', function() {
                    vscode.postMessage({ type: 'generateTodayData' });
                });
                
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'dateList':
                            updateDateList(message.dates);
                            break;
                        case 'dateData':
                            updateDateData(message.data);
                            break;
                    }
                });
                
                function updateDateList(dates) {
                    const selector = document.getElementById('date-selector');
                    selector.innerHTML = '<option value="">选择日期...</option>';
                    
                    dates.forEach(date => {
                        const option = document.createElement('option');
                        option.value = date;
                        option.textContent = date;
                        selector.appendChild(option);
                    });
                    
                    if (dates.length === 0) {
                        document.getElementById('data-content').innerHTML = '<div class="no-data">暂无数据快照<br>请先生成今日数据</div>';
                    }
                }
                
                let currentData = null;
                let normalFilters = { dict: 'all', sort: 'word' };
                let dictationFilters = { dict: 'all', sort: 'word' };

                function updateDateData(data) {
                    if (!data) {
                        document.getElementById('data-content').innerHTML = '<div class="no-data">该日期暂无数据</div>';
                        return;
                    }

                    currentData = data;

                    let html = '<div class="stats-overview">';
                    html += '<h3>📊 总体统计</h3>';
                    html += '<div class="stats-grid">';
                    html += '<div class="stat-item"><div class="stat-value">' + (data.totalStats.totalWordsNormal || 0) + '</div><div class="stat-label">正常模式单词数</div></div>';
                    html += '<div class="stat-item"><div class="stat-value">' + (data.totalStats.totalWordsDictation || 0) + '</div><div class="stat-label">默写模式单词数</div></div>';
                    html += '<div class="stat-item"><div class="stat-value">' + (data.totalStats.totalWordsAll || 0) + '</div><div class="stat-label">总单词数</div></div>';
                    html += '</div></div>';

                    html += '<div class="modes-container">';
                    
                    // 正常模式 - 左下角
                    html += '<div class="mode-section">';
                    html += '<h3>📝 正常模式单词列表</h3>';
                    html += generateFilters('normal', data.modes?.normal?.words || []);
                    html += '<div id="normal-words-table"></div>';
                    html += '</div>';
                    
                    // 默写模式 - 右下角
                    html += '<div class="mode-section">';
                    html += '<h3>✍️ 默写模式单词列表</h3>';
                    html += generateFilters('dictation', data.modes?.dictation?.words || []);
                    html += '<div id="dictation-words-table"></div>';
                    html += '</div>';
                    
                    html += '</div>';

                    document.getElementById('data-content').innerHTML = html;
                    
                    // 渲染表格
                    renderWordsTable('normal', data.modes?.normal?.words || []);
                    renderWordsTable('dictation', data.modes?.dictation?.words || []);
                    
                    // 绑定筛选事件
                    bindFilterEvents();
                }

                function generateFilters(mode, words) {
                    const dicts = [...new Set(words.map(w => w.dictName || w.dictId))];
                    
                    let html = '<div class="filters-container">';
                    html += '<div class="filter-group">';
                    html += '<select class="filter-select" id="' + mode + '-dict-filter">';
                    html += '<option value="all">全部词典</option>';
                    dicts.forEach(dict => {
                        html += '<option value="' + dict + '">' + dict + '</option>';
                    });
                    html += '</select></div>';
                    
                    html += '<div class="filter-group">';
                    html += '<select class="filter-select" id="' + mode + '-sort-filter">';
                    html += '<option value="word">按单词</option>';
                    html += '<option value="word-desc">按单词(倒序)</option>';
                    html += '<option value="practiceCount">按练习次数</option>';
                    html += '<option value="practiceCount-desc">按练习次数(倒序)</option>';
                    html += '<option value="correctRate">按正确率</option>';
                    html += '<option value="correctRate-desc">按正确率(倒序)</option>';
                    html += '<option value="lastPracticeTime">按最后练习时间</option>';
                    html += '<option value="lastPracticeTime-desc">按最后练习时间(倒序)</option>';
                    html += '</select></div>';
                    html += '</div>';
                    
                    return html;
                }

                function renderWordsTable(mode, words) {
                    const filters = mode === 'normal' ? normalFilters : dictationFilters;
                    
                    // 筛选
                    let filteredWords = words;
                    if (filters.dict !== 'all') {
                        filteredWords = words.filter(w => (w.dictName || w.dictId) === filters.dict);
                    }
                    
                    // 排序
                    filteredWords.sort((a, b) => {
                        const aRecord = a.practiceRecord || {};
                        const bRecord = b.practiceRecord || {};
                        
                        const isDesc = filters.sort.endsWith('-desc');
                        const sortType = filters.sort.replace('-desc', '');
                        
                        let result = 0;
                        switch (sortType) {
                            case 'practiceCount':
                                result = (aRecord.practiceCount || 0) - (bRecord.practiceCount || 0);
                                break;
                            case 'correctRate':
                                result = (aRecord.correctRate || 0) - (bRecord.correctRate || 0);
                                break;
                            case 'lastPracticeTime':
                                const aTime = aRecord.lastPracticeTime || '';
                                const bTime = bRecord.lastPracticeTime || '';
                                if (aTime === '从未练习' && bTime === '从未练习') result = 0;
                                else if (aTime === '从未练习') result = 1;
                                else if (bTime === '从未练习') result = -1;
                                else result = aTime.localeCompare(bTime);
                                break;
                            default: // word
                                result = a.word.localeCompare(b.word);
                        }
                        
                        return isDesc ? -result : result;
                    });
                    
                    let html = '<div class="words-table"><table>';
                    html += '<thead><tr><th>单词</th><th>词典</th><th>章节</th><th>练习次数</th><th>正确次数</th><th>错误次数</th><th>正确率</th><th>最后练习时间</th></tr></thead><tbody>';
                    
                    filteredWords.forEach(function(wordItem) {
                        const record = wordItem.practiceRecord || {};
                        html += '<tr>';
                        html += '<td class="word-name">' + wordItem.word + '</td>';
                        html += '<td>' + (wordItem.dictName || wordItem.dictId) + '</td>';
                        html += '<td>' + wordItem.chapterName + '</td>';
                        html += '<td>' + (record.practiceCount || 0) + '</td>';
                        html += '<td>' + (record.correctCount || 0) + '</td>';
                        html += '<td>' + (record.errorCount || 0) + '</td>';
                        html += '<td>' + (record.correctRate || 0).toFixed(1) + '%</td>';
                        const lastTime = record.lastPracticeTime;
                        let timeDisplay = '从未练习';
                        if (lastTime && lastTime !== '从未练习') {
                            const date = new Date(lastTime);
                            if (!isNaN(date.getTime())) {
                                timeDisplay = date.toLocaleString('zh-CN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            } else {
                                timeDisplay = lastTime;
                            }
                        }
                        html += '<td>' + timeDisplay + '</td>';
                        html += '</tr>';
                    });
                    
                    html += '</tbody></table></div>';
                    
                    document.getElementById(mode + '-words-table').innerHTML = html;
                }

                function bindFilterEvents() {
                    // 正常模式筛选
                    document.getElementById('normal-dict-filter').addEventListener('change', function() {
                        normalFilters.dict = this.value;
                        renderWordsTable('normal', currentData.modes?.normal?.words || []);
                    });
                    
                    document.getElementById('normal-sort-filter').addEventListener('change', function() {
                        normalFilters.sort = this.value;
                        renderWordsTable('normal', currentData.modes?.normal?.words || []);
                    });
                    
                    // 默写模式筛选
                    document.getElementById('dictation-dict-filter').addEventListener('change', function() {
                        dictationFilters.dict = this.value;
                        renderWordsTable('dictation', currentData.modes?.dictation?.words || []);
                    });
                    
                    document.getElementById('dictation-sort-filter').addEventListener('change', function() {
                        dictationFilters.sort = this.value;
                        renderWordsTable('dictation', currentData.modes?.dictation?.words || []);
                    });
                }
            </script>
        </body>
        </html>`;
    }
}