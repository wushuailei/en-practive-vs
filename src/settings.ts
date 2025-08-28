import * as vscode from 'vscode';
import { PluginSettings, defaultSettings } from './types';

// 设置管理函数
export async function getSettings(context: vscode.ExtensionContext): Promise<PluginSettings> {
    try {
        // 使用 globalState 替代文件系统存储
        const settings = context.globalState.get<PluginSettings>('enpractice.settings');
        if (settings) {
            return settings;
        }
        // 如果 globalState 中没有设置，则返回默认设置
        return defaultSettings;
    } catch (error) {
        console.error('读取设置失败，使用默认设置:', error);
        return defaultSettings;
    }
}

export async function saveSettings(context: vscode.ExtensionContext, settings: PluginSettings): Promise<void> {
    try {
        // 使用 globalState 替代文件系统存储
        await context.globalState.update('enpractice.settings', settings);
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