import * as vscode from 'vscode';
import { PluginSettings, WordData, ChapterInfo, defaultSettings, defaultWordsData, FIXED_WORDS_PER_CHAPTER, DictRecord, PracticeMode } from './types';
import { getSettings, updateSetting } from './settings';
import { getStoredWordBooks, loadWordBookData } from './wordbooks';
import { ShardedRecordManager } from './shardedRecordManager';

export class PracticeWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private wordsData: WordData[] = [];
    private context: vscode.ExtensionContext;
    private isInitialized: boolean = false;
    private settings: PluginSettings = defaultSettings;
    private currentChapterWords: WordData[] = [];
    private recordManager: ShardedRecordManager;
    private currentDictRecord?: DictRecord;
    private currentDictId: string = '';

    constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this.context = context;
        // 统一使用分片记录管理器
        this.recordManager = new ShardedRecordManager(context);
    }



    private async loadWordsData() {
        try {
            // 首先读取设置文件，获取当前词书配置
            this.settings = await getSettings(this.context);
            // 尝试从 wordbooks.json 读取词书列表
            try {
                const wordBooksList = await getStoredWordBooks(this.context);
                
                // 查找设置中指定的当前词书
                let targetBook = wordBooksList.find((book: any) => book.id === this.settings.currentWordbook);
                
                // 如果找不到设置中的词书，则使用第一个可用的词书
                if (!targetBook && wordBooksList.length > 0) {
                    targetBook = wordBooksList[0];
                    // 更新设置文件
                    await updateSetting(this.context, 'currentWordbook', targetBook.id);
                    this.settings.currentWordbook = targetBook.id;
                }
                
                if (targetBook) {
                    this.wordsData = await loadWordBookData(this.context, targetBook.id);
                    this.currentDictId = targetBook.id;
                    
                    // 加载词典记录
                    this.currentDictRecord = await this.recordManager.loadDictRecord(
                        targetBook.id, 
                        targetBook.name, 
                        this.wordsData.length,
                        this.settings.practiceMode
                    );
                    
                    // 从记录中恢复练习进度
                    if (this.currentDictRecord) {
                        this.settings.currentChapter = this.currentDictRecord.currentChapter;
                        this.settings.currentWordIndex = this.currentDictRecord.currentWordIndex;
                        this.settings.practiceMode = this.currentDictRecord.practiceMode;
                        this.settings.chapterLoop = this.currentDictRecord.chapterLoop;
                    }
                    
                    return;
                }
            } catch (listError) {
                console.error('无法读取wordbooks.json，使用默认词书:', listError);
            }
            
            this.useDefaultWords();
        } catch (error) {
            console.error('加载词书失败:', error);
            this.useDefaultWords();
        }
    }

    private useDefaultWords() {
        this.wordsData = defaultWordsData;
    }

    public async switchStoredWordBook(context: vscode.ExtensionContext, bookId: string) {
        try {
            // 从 wordbooks.json 获取词书信息
            const wordBooksList = await getStoredWordBooks(context);
            const targetBook = wordBooksList.find((book: any) => book.id === bookId);
            
            if (targetBook) {
                this.wordsData = await loadWordBookData(context, bookId);
                this.currentDictId = bookId;
                
                // 加载新词典的记录
                this.currentDictRecord = await this.recordManager.loadDictRecord(
                    bookId, 
                    targetBook.name, 
                    this.wordsData.length,
                    this.settings.practiceMode
                );
                
                // 恢复进度
                if (this.currentDictRecord) {
                    this.settings.currentChapter = this.currentDictRecord.currentChapter;
                    this.settings.currentWordIndex = this.currentDictRecord.currentWordIndex;
                    this.settings.practiceMode = this.currentDictRecord.practiceMode;
                    this.settings.chapterLoop = this.currentDictRecord.chapterLoop;
                }
                
                // 更新设置文件中的当前词书
                await updateSetting(context, 'currentWordbook', bookId);
                
                // 更新练习面板webview数据
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'loadWords',
                        data: this.wordsData
                    });
                }
                
                vscode.window.showInformationMessage(`已切换到词书: ${targetBook.name}`);
            } else {
                vscode.window.showErrorMessage(`词书不存在: ${bookId}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`切换词书失败: ${error}`);
        }
    }
    
    // 添加公共方法来访问私有属性
    public getSettings(): PluginSettings {
        return this.settings;
    }

    public getCurrentDictId(): string {
        return this.currentDictId;
    }

    public getRecordManager(): ShardedRecordManager {
        return this.recordManager;
    }

    public async updateChapterLoopSetting(chapterLoop: boolean): Promise<void> {
        this.settings.chapterLoop = chapterLoop;
        
        // 更新记录
        if (this.currentDictId) {
            await this.recordManager.updateChapterLoop(this.currentDictId, chapterLoop, this.settings.practiceMode);
        }
    }

    // 更新练习模式
    public async updatePracticeMode(practiceMode: PracticeMode): Promise<void> {
        this.settings.practiceMode = practiceMode;
        
        // 加载新模式的记录
        if (this.currentDictId) {
            const wordBooksList = await getStoredWordBooks(this.context);
            const targetBook = wordBooksList.find((book: any) => book.id === this.currentDictId);
            if (targetBook) {
                this.currentDictRecord = await this.recordManager.loadDictRecord(
                    this.currentDictId, 
                    targetBook.name, 
                    this.wordsData.length,
                    practiceMode
                );
                
                // 从记录中恢复进度
                if (this.currentDictRecord) {
                    this.settings.currentChapter = this.currentDictRecord.currentChapter;
                    this.settings.currentWordIndex = this.currentDictRecord.currentWordIndex;
                    this.settings.chapterLoop = this.currentDictRecord.chapterLoop;
                }
                
                // 重新生成HTML并更新webview
                if (this._view) {
                    this._view.webview.html = this._getHtmlForWebview(this._view.webview, practiceMode);
                    // 等待webview加载完成后发送数据
                    setTimeout(() => {
                        this.updateWebview();
                    }, 100);
                }
            }
        }
    }

    // 添加刷新词书数据的方法
    public async refreshWordBooks() {
        // 重新初始化所有数据
        this.isInitialized = false;
        this.settings = defaultSettings;
        this.currentDictRecord = undefined;
        this.currentDictId = '';
        this.wordsData = [];
        this.currentChapterWords = [];
        
        // 重新加载数据
        await this.initializeWordsData();
        
        // 更新webview显示
        if (this._view) {
            // 重新生成HTML以确保所有元素都正确初始化
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, this.settings.practiceMode);
            
            // 等待webview加载完成后发送数据
            setTimeout(() => {
                this.updateWebview();
            }, 100);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        // 先初始化数据，然后设置HTML
        this.initializeWordsData().then(() => {
            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this.settings.practiceMode);
            // HTML设置完成后，立即发送初始数据
            setTimeout(() => {
                this.updateWebview();
            }, 100);
        });

        // 监听来自 webview 的消息
        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'inputChange':
                        break;
                    case 'wordPracticeResult':
                        // 记录单词练习结果
                        await this.recordWordPractice(message.word, message.isCorrect);
                        break;
                    case 'ready':
                        // webview加载完成后，发送数据
                        this.updateWebview();
                        break;
                    case 'switchChapter':
                        await this.switchChapter(message.chapter);
                        break;
                    case 'nextWord':
                        await this.nextWord();
                        break;
                    case 'openDataViewer':
                        // 打开数据查看器
                        const dataViewerProvider = new (await import('./dataViewerProvider')).DataViewerProvider(this.context);
                        dataViewerProvider.show();
                        break;
                }
            }
        );
    }

    // 新增初始化方法
    private async initializeWordsData(): Promise<void> {
        if (!this.isInitialized) {
            await this.loadWordsData();
            this.isInitialized = true;
        }
    }

    // 计算章节信息
    private getChapterInfo(): ChapterInfo {
        const totalWords = this.wordsData.length;
        const wordsPerChapter = FIXED_WORDS_PER_CHAPTER;
        const totalChapters = Math.ceil(totalWords / wordsPerChapter);
        const currentChapter = Math.min(this.settings.currentChapter, totalChapters);
        
        return {
            totalWords,
            wordsPerChapter,
            totalChapters,
            currentChapter
        };
    }

    // 获取当前章节的单词
    // 获取当前章节的单词列表
    private getCurrentChapterWords(): WordData[] {
        const chapterInfo = this.getChapterInfo();
        
        // 只使用顺序模式
        const startIndex = (chapterInfo.currentChapter - 1) * chapterInfo.wordsPerChapter;
        const endIndex = Math.min(startIndex + chapterInfo.wordsPerChapter, this.wordsData.length);
        
        this.currentChapterWords = this.wordsData.slice(startIndex, endIndex);
        return this.currentChapterWords;
    }

    // 获取当前单词
    private getCurrentWord(): WordData | null {
        const chapterWords = this.getCurrentChapterWords();
        const wordIndex = Math.min(this.settings.currentWordIndex, chapterWords.length - 1);
        return chapterWords[wordIndex] || null;
    }

    // 更新webview显示
    private updateWebview() {
        if (this._view) {
            const chapterInfo = this.getChapterInfo();
            const currentWord = this.getCurrentWord();
            const chapterWords = this.getCurrentChapterWords();
            
            this._view.webview.postMessage({
                command: 'updateDisplay',
                data: {
                    currentWord,
                    chapterInfo,
                    currentWordIndex: this.settings.currentWordIndex,
                    currentWordPosition: this.settings.currentWordIndex + 1, // 1-based position
                    chapterWordsCount: chapterWords.length,
                    settings: this.settings
                }
            });
        }
    }

    // 切换章节
    private async switchChapter(chapterNumber: number) {
        const chapterInfo = this.getChapterInfo();
        if (chapterNumber >= 1 && chapterNumber <= chapterInfo.totalChapters) {
            await updateSetting(this.context, 'currentChapter', chapterNumber);
            await updateSetting(this.context, 'currentWordIndex', 0);
            this.settings.currentChapter = chapterNumber;
            this.settings.currentWordIndex = 0;
            
            // 更新记录
            if (this.currentDictId) {
                await this.recordManager.updateCurrentPosition(this.currentDictId, chapterNumber, 0, this.settings.practiceMode);
            }
            
            this.updateWebview();
        }
    }

    // 下一个单词
    private async nextWord() {
        const chapterWords = this.getCurrentChapterWords();
        const nextIndex = this.settings.currentWordIndex + 1;
        
        if (nextIndex < chapterWords.length) {
            // 当前章节还有单词，直接跳转
            await updateSetting(this.context, 'currentWordIndex', nextIndex);
            this.settings.currentWordIndex = nextIndex;
            
            // 更新记录
            if (this.currentDictId) {
                await this.recordManager.updateCurrentPosition(
                    this.currentDictId, 
                    this.settings.currentChapter, 
                    nextIndex,
                    this.settings.practiceMode
                );
            }
            
            this.updateWebview();
        } else {
            // 当前章节已完成，记录章节完成
            if (this.currentDictId) {
                await this.recordManager.recordChapterCompletion(
                    this.currentDictId, 
                    this.settings.currentChapter,
                    this.settings.practiceMode
                );
            }
            
            // 检查单章循环设置
            if (this.settings.chapterLoop) {
                // 单章循环：回到当前章节第一个单词
                await updateSetting(this.context, 'currentWordIndex', 0);
                this.settings.currentWordIndex = 0;
                
                // 更新记录
                if (this.currentDictId) {
                    await this.recordManager.updateCurrentPosition(
                        this.currentDictId, 
                        this.settings.currentChapter, 
                        0,
                        this.settings.practiceMode
                    );
                }
                
                this.updateWebview();
                // 移除章节循环重新开始的长时间提示
            } else {
                // 非循环模式：检查是否有下一章
                const chapterInfo = this.getChapterInfo();
                if (this.settings.currentChapter < chapterInfo.totalChapters) {
                    await this.switchChapter(this.settings.currentChapter + 1);
                    // 移除章节完成的长时间提示
                } else {
                    // 保留所有章节完成的提示，但这种情况较少发生
                    vscode.window.showInformationMessage('所有章节已完成！');
                }
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, practiceMode: PracticeMode = 'normal'): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Practice Input</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .content {
            flex: 1;
            padding: 15px;
            display: flex;
            flex-direction: column;
        }
        
        .word-display {
            background-color: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 80px;
        }
        
        .word-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .word-main-info {
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
        }
        
        .word-name {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-foreground);
            letter-spacing: 1px;
            flex-shrink: 0;
        }
        
        .word-name .letter {
            transition: all 0.2s ease;
            position: relative;
        }
        
        .word-name .letter.correct {
            color: #9333ea;
            background-color: rgba(147, 51, 234, 0.2);
            border-radius: 2px;
        }
        
        .shake {
            animation: shake 0.5s ease-in-out;
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .word-phonetics {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .word-trans {
            font-size: 13px;
            color: var(--vscode-foreground);
            line-height: 1.4;
        }
        
        .dictation-mode-text {
            font-size: 16px;
            font-weight: bold;
            color: var(--vscode-charts-blue);
            text-align: center;
            margin-bottom: 10px;
        }
        
        .input-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 10px;
            background-color: var(--vscode-sideBar-background);
            border-top: 1px solid var(--vscode-widget-border);
        }
        
        input[type="text"] {
            width: 100%;
            padding: 8px 10px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            box-sizing: border-box;
        }
        
        input[type="text"]:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        input[type="text"]::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="chapter-info" id="chapterInfo" style="background-color: var(--vscode-editor-widget-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 10px; margin-bottom: 15px; font-size: 12px;">
            <div class="info-row" style="display: flex; flex-wrap: wrap; align-items: center; gap: 15px;">
                <div class="chapter-display" style="flex: 0 0 auto;">章节: - / - | 单词: - / -</div>

                <div class="chapter-selector" style="display: flex; align-items: center; gap: 8px; flex: 0 0 auto;">
                    <span>选择章节:</span>
                    <select class="chapter-select" id="chapterSelect" onchange="switchChapter(this.value)" style="background-color: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); padding: 2px 6px; border-radius: 2px; font-size: 11px;">
                        <option value="1">第 1 章</option>
                    </select>
                </div>
            </div>
        </div>
        
        ${practiceMode === 'dictation' ? `
        <div class="word-display">
            <div class="word-content" id="wordContent">
                <div class="word-main-info">
                </div>
                <div class="word-phonetics">
                    <span>美: <span id="usPhone">/rɪˈmot/</span></span>
                    <span>英: <span id="ukPhone">/rɪˈməʊt/</span></span>
                </div>
                <div class="word-trans" id="wordTrans">远程的 (adj.), 遥控器 (noun)</div>
            </div>
        </div>
        ` : `
        <div class="word-display">
            <div class="word-content" id="wordContent">
                <div class="word-main-info">
                    <div class="word-name" id="wordName"></div>
                    <div class="word-phonetics">
                        <span>美: <span id="usPhone">/rɪˈmot/</span></span>
                        <span>英: <span id="ukPhone">/rɪˈməʊt/</span></span>
                    </div>
                </div>
                <div class="word-trans" id="wordTrans">远程的 (adj.), 遥控器 (noun)</div>
            </div>
        </div>
        `}
    </div>
    
    <div class="input-container">
        <input type="text" id="practiceInput" placeholder="请在这里输入..." />
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const input = document.getElementById('practiceInput');
        
        let currentWordIndex = 0;
        let currentWordData = null; // 保存当前单词数据
        let practiceMode = '${practiceMode}'; // 初始化练习模式
        let wordsData = [];
        
        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loadWords':
                    if (message.data && message.data.length > 0) {
                        wordsData = message.data;
                        currentWordIndex = 0;
                        currentWordData = wordsData[0]; // 设置初始单词数据
                        updateWordDisplay();
                    }
                    break;
                case 'updateDisplay':
                    if (message.data) {
                        const { currentWord, chapterInfo, currentWordIndex: newIndex, currentWordPosition, chapterWordsCount, settings } = message.data;
                        if (currentWord) {
                            // 更新当前单词索引和当前单词数据
                            currentWordIndex = newIndex || 0;
                            currentWordData = currentWord; // 保存当前单词数据
                            
                            // 更新练习模式（如果有提供）
                            if (settings && settings.practiceMode) {
                                practiceMode = settings.practiceMode;

                            }
                            
                            // 更新章节信息
                            updateChapterDisplay(chapterInfo, currentWordPosition, chapterWordsCount);
                            
                            // 更新单词显示
                            updateCurrentWordDisplay(currentWord);
                        }
                    }
                    break;
            }
        });
        
        function updateChapterDisplay(chapterInfo, currentWordPosition, chapterWordsCount) {
            if (!chapterInfo) return;
            
            // 更新章节信息文本
            const chapterInfoElement = document.getElementById('chapterInfo');
            if (chapterInfoElement) {
                const chapterDisplayDiv = chapterInfoElement.querySelector('.chapter-display');
                if (chapterDisplayDiv) {
                    const wordPosition = currentWordPosition || 1;
                    const totalWordsInChapter = chapterWordsCount || chapterInfo.wordsPerChapter;
                    chapterDisplayDiv.textContent = '章节: ' + chapterInfo.currentChapter + '/' + chapterInfo.totalChapters + ' | 单词: ' + wordPosition + '/' + totalWordsInChapter;
                }
            }
            
            // 更新章节选择器
            const chapterSelect = document.getElementById('chapterSelect');
            if (chapterSelect) {
                chapterSelect.innerHTML = '';
                for (let i = 1; i <= chapterInfo.totalChapters; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = '第 ' + i + ' 章';
                    if (i === chapterInfo.currentChapter) {
                        option.selected = true;
                    }
                    chapterSelect.appendChild(option);
                }
            }
        }
        
        function updateCurrentWordDisplay(word) {
            if (!word) return;
            
            // 根据练习模式动态更新显示
            if (practiceMode === 'dictation') {
                // 默写模式：隐藏单词名称和音标，只显示翻译
                const wordNameElement = document.getElementById('wordName');
                if (wordNameElement) {
                    wordNameElement.style.display = 'none';
                }
                
                // 隐藏音标
                const wordPhonetics = document.querySelector('.word-phonetics');
                if (wordPhonetics) {
                    wordPhonetics.style.display = 'none';
                }
                
                // 移除默写模式提示（如果存在）
                const dictationText = document.querySelector('.dictation-mode-text');
                if (dictationText) {
                    dictationText.remove();
                }
            } else {
                // 正常模式：显示单词名称、音标和字母分割
                const wordNameElement = document.getElementById('wordName');
                if (wordNameElement) {
                    wordNameElement.style.display = 'block';
                    wordNameElement.innerHTML = '';
                    for (let i = 0; i < word.name.length; i++) {
                        const span = document.createElement('span');
                        span.className = 'letter';
                        span.textContent = word.name[i];
                        wordNameElement.appendChild(span);
                    }
                }
                
                // 显示音标
                const wordPhonetics = document.querySelector('.word-phonetics');
                if (wordPhonetics) {
                    wordPhonetics.style.display = 'flex';
                }
                
                // 移除默写模式提示
                const dictationText = document.querySelector('.dictation-mode-text');
                if (dictationText) {
                    dictationText.remove();
                }
            }
            
            // 更新音标和翻译（只在正常模式下显示音标）
            if (practiceMode === 'normal') {
                document.getElementById('usPhone').textContent = word.usphone || '';
                document.getElementById('ukPhone').textContent = word.ukphone || '';
            }
            document.getElementById('wordTrans').textContent = word.trans ? word.trans.join(', ') : '';
            
            // 清空输入框
            input.value = '';
            if (practiceMode === 'normal') {
                updateHighlight('');
            }
        }
        
        function switchChapter(chapterNumber) {
            vscode.postMessage({
                command: 'switchChapter',
                chapter: parseInt(chapterNumber)
            });
        }
        
        function updateWordDisplay() {
            if (wordsData.length === 0) return;
            
            const word = wordsData[currentWordIndex];
            
            // 创建字母分割显示
            const wordNameElement = document.getElementById('wordName');
            wordNameElement.innerHTML = '';
            for (let i = 0; i < word.name.length; i++) {
                const span = document.createElement('span');
                span.className = 'letter';
                span.textContent = word.name[i];
                wordNameElement.appendChild(span);
            }
            
            document.getElementById('usPhone').textContent = word.usphone || '';
            document.getElementById('ukPhone').textContent = word.ukphone || '';
            document.getElementById('wordTrans').textContent = word.trans ? word.trans.join(', ') : '';
            
            // 清空输入框
            input.value = '';
            updateHighlight('');
        }
        
        function updateHighlight(inputText) {
            // 使用当前单词数据而不是从数组中获取
            const word = currentWordData;
            if (!word) return;
            
            const letters = document.querySelectorAll('.letter');
            const inputLower = inputText.toLowerCase();
            const wordLower = word.name.toLowerCase();
            
            letters.forEach((letter, index) => {
                letter.classList.remove('correct', 'current');
                
                if (index < inputLower.length) {
                    if (inputLower[index] === wordLower[index]) {
                        letter.classList.add('correct');
                    }
                }
            });
        }
        
        function checkInput(inputText) {
            // 使用当前单词数据而不是从数组中获取
            const word = currentWordData;
            if (!word) return;
            
            const inputLower = inputText.toLowerCase();
            const wordLower = word.name.toLowerCase();
            
            // 检查是否完全匹配
            if (inputLower === wordLower) {
                // 先记录练习结果，然后再进行后续操作
                vscode.postMessage({
                    command: 'wordPracticeResult',
                    word: word.name,
                    isCorrect: true
                });
                
                // 等待一小段时间确保记录先处理，然后再进行后续操作
                setTimeout(() => {
                    if (practiceMode === 'dictation') {
                        // 默写模式：显示正确的单词，然后跳转
                        showWordInDictationMode(word, true);
                    } else {
                        // 正常模式：直接跳转到下一个单词
                        vscode.postMessage({
                            command: 'nextWord'
                        });
                    }
                }, 10); // 10ms延迟，确保顺序执行
                
                return true;
            }
            
            // 对于正常模式，检查字母逐个匹配
            if (practiceMode === 'normal' && inputLower.length > 0) {
                const currentChar = inputLower[inputLower.length - 1];
                const expectedChar = wordLower[inputLower.length - 1];
                
                if (currentChar !== expectedChar || inputLower.length > wordLower.length) {
                    // 错误，显示错误动效并清空输入
                    const wordDisplay = document.querySelector('.word-display');
                    wordDisplay.classList.add('shake');
                    
                    // 记录错误结果
                    vscode.postMessage({
                        command: 'wordPracticeResult',
                        word: word.name,
                        isCorrect: false
                    });
                    
                    setTimeout(() => {
                        wordDisplay.classList.remove('shake');
                        input.value = '';
                        updateHighlight('');
                    }, 500);
                    return false;
                }
            }
            
            // 对于默写模式的错误处理
            if (practiceMode === 'dictation') {
                // 检查每个字符是否正确
                for (let i = 0; i < inputLower.length; i++) {
                    if (inputLower[i] !== wordLower[i]) {
                        // 输入错误，显示单词并提示错误
                        showWordInDictationMode(word, false);
                        
                        // 记录错误结果
                        vscode.postMessage({
                            command: 'wordPracticeResult',
                            word: word.name,
                            isCorrect: false
                        });
                        return false;
                    }
                }
                
                // 如果输入超出了单词长度
                if (inputLower.length > wordLower.length) {
                    showWordInDictationMode(word, false);
                    
                    // 记录错误结果
                    vscode.postMessage({
                            command: 'wordPracticeResult',
                            word: word.name,
                            isCorrect: false
                        });
                    return false;
                }
            }
            
            return null; // 继续输入
        }
        
        // 在默写模式下显示单词的函数
        function showWordInDictationMode(word, isCorrect) {
            const wordMainInfo = document.querySelector('.word-main-info');
            const wordDisplay = document.querySelector('.word-display');
            
            // 移除默写模式提示
            const dictationText = document.querySelector('.dictation-mode-text');
            if (dictationText) {
                dictationText.remove();
            }
            
            // 显示单词
            let wordNameElement = document.getElementById('wordName');
            if (!wordNameElement) {
                // 如果不存在，创建单词显示元素
                wordNameElement = document.createElement('div');
                wordNameElement.id = 'wordName';
                wordNameElement.className = 'word-name';
                wordMainInfo.insertBefore(wordNameElement, wordMainInfo.firstChild);
            }
            
            wordNameElement.style.display = 'block';
            wordNameElement.innerHTML = '';
            
            // 显示音标（显示答案时）
            const wordPhonetics = document.querySelector('.word-phonetics');
            if (wordPhonetics) {
                wordPhonetics.style.display = 'flex';
            }
            
            // 更新音标内容
            document.getElementById('usPhone').textContent = word.usphone || '';
            document.getElementById('ukPhone').textContent = word.ukphone || '';
            
            // 创建字母分割显示
            for (let i = 0; i < word.name.length; i++) {
                const span = document.createElement('span');
                span.className = 'letter';
                span.textContent = word.name[i];
                wordNameElement.appendChild(span);
            }
            
            // 根据正确性添加样式
            if (isCorrect) {
                wordNameElement.style.color = '#9333ea';
                wordNameElement.style.backgroundColor = 'rgba(147, 51, 234, 0.2)';
            } else {
                wordNameElement.style.color = 'var(--vscode-testing-iconFailed)';
                wordNameElement.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                wordDisplay.classList.add('shake');
            }
            
            // 清空输入框
            input.value = '';
            
            // 根据正确性设置不同的显示时间
            const displayTime = isCorrect ? 500 : 2000; // 正确0.5秒，错误2秒
            
            // 显示指定时间后跳转到下一个单词或恢复默写模式
            setTimeout(() => {
                if (isCorrect) {
                    // 正确答案：跳转到下一个单词
                    vscode.postMessage({
                        command: 'nextWord'
                    });
                } else {
                    // 错误答案：恢复默写模式，隐藏单词
                    wordNameElement.style.display = 'none';
                    wordNameElement.style.color = '';
                    wordNameElement.style.backgroundColor = '';
                    wordDisplay.classList.remove('shake');
                    
                    // 隐藏音标（恢复默写模式）
                    const wordPhonetics = document.querySelector('.word-phonetics');
                    if (wordPhonetics) {
                        wordPhonetics.style.display = 'none';
                    }
                    
                    // 重新聚焦输入框
                    input.focus();
                }
            }, displayTime);
        }
        
        // 初始化
        updateWordDisplay();
        
        // 添加键盘事件监听
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                input.value = '';
                updateHighlight('');
            }
        });
        
        // 输入框聚焦
        input.focus();
        
        // 通知扩展webview已经准备好
        vscode.postMessage({ command: 'ready' });
        
        input.addEventListener('input', function() {
            const inputText = this.value;
            
            // 只在正常模式下更新高亮显示
            if (practiceMode === 'normal') {
                updateHighlight(inputText);
            }
            
            // 检查输入
            const result = checkInput(inputText);
            
            // 发送消息给扩展
            vscode.postMessage({
                command: 'inputChange',
                text: inputText,
                currentWord: currentWordData?.name || '',
                isCorrect: result
            });
        });
    </script>
</body>
</html>`;
    }

    // 记录单词练习结果
    private async recordWordPractice(word: string, isCorrect: boolean) {
        if (this.currentDictId && word && typeof isCorrect === 'boolean') {
            // 获取当前词典名称
            let dictName = '';
            try {
                const wordBooksList = await getStoredWordBooks(this.context);
                const targetBook = wordBooksList.find((book: any) => book.id === this.currentDictId);
                if (targetBook) {
                    dictName = targetBook.name;
                }
            } catch (error) {
                console.error('获取词典名称失败:', error);
            }
            
            // 传递练习结果到记录管理器
            await this.recordManager.recordWordPractice(
                this.currentDictId,
                this.settings.currentChapter,
                word,
                isCorrect,  // 传递练习结果
                this.settings.practiceMode,
                dictName // 传递词典名称
            );
        }
    }
}