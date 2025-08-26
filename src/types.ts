// 插件设置接口定义
export interface PluginSettings {
    currentWordbook: string;
    wordsPerChapter: number;
    practiceMode: 'sequential';  // 只保留顺序模式
    showPhonetics: boolean;
    autoNextWord: boolean;
    chapterLoop: boolean;  // 单章循环设置
    lastUpdated: string;
    currentChapter: number;
    currentWordIndex: number;
}

// 单词数据接口
export interface WordData {
    usphone: string;
    ukphone: string;
    name: string;
    trans: string[];
}

// 词书信息接口
export interface WordBookInfo {
    id: string;
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    length?: number;
    url?: string;
    filename?: string;
}

// 章节信息接口
export interface ChapterInfo {
    totalWords: number;
    wordsPerChapter: number;
    totalChapters: number;
    currentChapter: number;
}

// 单词练习记录接口
export interface WordRecord {
    word: string;
    practiceCount: number;  // 练习次数
    correctCount: number;   // 正确次数
    errorCount: number;     // 错误次数
    lastPracticeTime: string; // 最后练习时间
    correctRate: number;    // 正确率
}

// 章节练习记录接口
export interface ChapterRecord {
    chapterNumber: number;
    totalWordsInChapter: number; // 该章节固定单词数（10个）
    completedWordsCount: number; // 已完成单词数量（有练习记录的单词数）
    chapterCompletionCount: number; // 章节完成次数（所有单词正确次数中的最小值）
    lastPracticeTime: string;
    wordRecords: { [word: string]: WordRecord }; // 该章节内单词的记录
}

// 词典练习记录接口（只保留基本信息，不含练习统计）
export interface DictRecord {
    dictId: string;
    dictName: string;
    totalWords: number;
    totalChapters: number;
    currentChapter: number;
    currentWordIndex: number;
    practiceMode: 'sequential';  // 只保留顺序模式
    chapterLoop: boolean;
    lastPracticeTime: string;
    createdTime: string;
    // 移除 chapterRecords 和 globalStats，这些数据从章节记录中计算得出
}

// 固定章节单词数量为10
export const FIXED_WORDS_PER_CHAPTER = 10;

// 默认练习记录（只保留基本信息）
export const createDefaultDictRecord = (dictId: string, dictName: string, totalWords: number): DictRecord => {
    const totalChapters = Math.ceil(totalWords / FIXED_WORDS_PER_CHAPTER);
    return {
        dictId,
        dictName,
        totalWords,
        totalChapters,
        currentChapter: 1,
        currentWordIndex: 0,
        practiceMode: 'sequential',
        chapterLoop: true,
        lastPracticeTime: new Date().toISOString(),
        createdTime: new Date().toISOString()
    };
};

// 默认设置
export const defaultSettings: PluginSettings = {
    currentWordbook: 'hongbaoshu-2026',
    wordsPerChapter: FIXED_WORDS_PER_CHAPTER,
    practiceMode: 'sequential',  // 只使用顺序模式
    showPhonetics: true,
    autoNextWord: false,
    chapterLoop: true,  // 默认开启单章循环
    lastUpdated: new Date().toISOString().split('T')[0],
    currentChapter: 1,
    currentWordIndex: 0
};

// 默认词汇数据
export const defaultWordsData: WordData[] = [
    {
        "usphone": "/rɪˈmot/",
        "ukphone": "/rɪˈməʊˈ/",
        "name": "remote",
        "trans": [
            "远程的 (adj.)",
            "遥控器 (noun)"
        ]
    },
    {
        "usphone": "/rɪˈmuv/",
        "ukphone": "/rɪˈmu:v/",
        "name": "remove",
        "trans": [
            "移除， 去掉 (vt.)"
        ]
    },
    {
        "usphone": "/ˈpraɪvət/",
        "ukphone": "/ˈpraɪvət/",
        "name": "private",
        "trans": [
            "私有的，个人的 (adj.)"
        ]
    }
];