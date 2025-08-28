import * as vscode from 'vscode';
import { PluginSettings, defaultSettings } from './types';

// 设置管理函数
export async function getSettings(context: vscode.ExtensionContext): Promise<PluginSettings> {
    try {
        const settingsPath = vscode.Uri.joinPath(context.extensionUri, 'data', 'config', 'settings.json');
        const fileData = await vscode.workspace.fs.readFile(settingsPath);
        const content = Buffer.from(fileData).toString('utf8');
        const settings = JSON.parse(content) as PluginSettings;
        return settings;
    } catch (error) {
        console.error('读取设置失败，使用默认设置:', error);
        return defaultSettings;
    }
}

export async function saveSettings(context: vscode.ExtensionContext, settings: PluginSettings): Promise<void> {
    try {
        const settingsPath = vscode.Uri.joinPath(context.extensionUri, 'data', 'config', 'settings.json');
        const content = JSON.stringify(settings, null, 2);
        await vscode.workspace.fs.writeFile(settingsPath, Buffer.from(content, 'utf8'));
    } catch (error) {
        console.error('保存设置失败:', error);
    }
}

export async function updateSetting<K extends keyof PluginSettings>(
    context: vscode.ExtensionContext, 
    key: K, 
    value: PluginSettings[K]
): Promise<void> {
    const settings = await getSettings(context);
    settings[key] = value;
    settings.lastUpdated = new Date().toISOString().split('T')[0];
    await saveSettings(context, settings);
}