import * as vscode from 'vscode';
import { WordBookInfo, WordData, defaultWordsData } from './types';

// 词书管理相关函数
export async function getStoredWordBooks(context: vscode.ExtensionContext): Promise<WordBookInfo[]> {
    try {
        // 从 data/wordbooks.json 读取词书列表
        const wordBooksListPath = vscode.Uri.joinPath(context.extensionUri, 'data', 'config', 'wordbooks.json');
        console.log('尝试读取词书列表文件:', wordBooksListPath.fsPath);
        
        const fileData = await vscode.workspace.fs.readFile(wordBooksListPath);
        const content = Buffer.from(fileData).toString('utf8');
        console.log('成功读取文件，内容长度:', content.length);
        
        const wordBooksList = JSON.parse(content);
        console.log('从wordbooks.json读取到的数据:', wordBooksList);
        
        // 验证每个词书文件是否存在
        const validWordBooks = [];
        for (const book of wordBooksList) {
            try {
                // 使用url字段作为文件名
                const filename = book.url || book.filename;
                if (filename) {
                    const bookPath = vscode.Uri.joinPath(context.extensionUri, 'data', 'dicts', filename);
                    await vscode.workspace.fs.stat(bookPath); // 检查文件是否存在
                    validWordBooks.push(book);
                    console.log(`词书文件存在: ${filename}`);
                } else {
                    console.log('词书配置缺少文件名:', book);
                }
            } catch {
                console.log(`词书文件不存在: ${book.url || book.filename}`);
            }
        }
        
        console.log('有效的词书列表:', validWordBooks);
        return validWordBooks;
    } catch (error) {
        console.log('读取词书列表失败:', error);
        return [];
    }
}

export async function loadWordBookData(
    context: vscode.ExtensionContext, 
    bookId: string
): Promise<WordData[]> {
    try {
        const wordBooksList = await getStoredWordBooks(context);
        const targetBook = wordBooksList.find(book => book.id === bookId);
        
        if (targetBook) {
            const filename = targetBook.url || targetBook.filename;
            if (filename) {
                const bookPath = vscode.Uri.joinPath(context.extensionUri, 'data', 'dicts', filename);
                const bookData = await vscode.workspace.fs.readFile(bookPath);
                const bookContent = Buffer.from(bookData).toString('utf8');
                const wordsData = JSON.parse(bookContent) as WordData[];
                console.log(`加载词书成功: ${targetBook.name}, 单词数量: ${wordsData.length}`);
                return wordsData;
            }
        }
        
        console.log('未找到指定词书，使用默认数据');
        return defaultWordsData;
    } catch (error) {
        console.error('加载词书数据失败:', error);
        return defaultWordsData;
    }
}

export async function getAvailableWordBooks(extensionUri: vscode.Uri): Promise<string[]> {
    try {
        const dataUri = vscode.Uri.joinPath(extensionUri, 'data', 'dicts');
        const files = await vscode.workspace.fs.readDirectory(dataUri);
        return files
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
            .map(([name]) => name);
    } catch {
        return ['words.json'];
    }
}