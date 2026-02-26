/**
 * GenesisEngine 主页面
 * PetriLabs · Genesis Engine
 * 
 * 记忆文件 → 动态基因组的完整管线前端
 */

import React, { useState, useCallback } from 'react';
import { FileUploader } from './FileUploader';
import { GenomeVisualizer } from './GenomeVisualizer';
import type { GenesisResult } from '../src/GenesisEngine';

// 为了前端演示，这里模拟后端调用
// 实际使用时应该通过 API 调用 genesisEngine.generateGenome()
const mockGenerateGenome = async (content: string): Promise<GenesisResult> => {
  // 模拟延迟 3 秒
  await new Promise(r => setTimeout(r, 3000));
  
  // 这里应该是实际的 API 调用
  // const result = await fetch('/api/genesis/generate', { method: 'POST', body: JSON.stringify({ content }) });
  
  console.log('Generated genome from content:', content.substring(0, 100) + '...');
  
  // 返回模拟结果
  return {
    success: true,
    standardized: null,
    genome: null, // 实际使用时填充
    deployable: null,
    validation: null,
    agentId: `agent-${Date.now()}`
  };
};

export const GenesisEnginePage: React.FC = () => {
  const [content, setContent] = useState('');
  const [contentSource, setContentSource] = useState<'file' | 'paste'>('file');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleContentChange = useCallback((newContent: string, source: 'file' | 'paste') => {
    setContent(newContent);
    setContentSource(source);
    setError(null);
  }, []);

  const handleGenerate = async () => {
    if (!content.trim()) {
      setError('请先上传文件或粘贴文本');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const result = await mockGenerateGenome(content);
      
      if (result.success) {
        setResult(result);
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!result?.deployable) {
      console.log('No genome to download');
      return;
    }

    const blob = new Blob([JSON.stringify(result.deployable, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.agentId}-genome.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeploy = () => {
    if (!result?.deployable) {
      console.log('No genome to deploy');
      return;
    }

    // 预留：后续接入 Akash 部署流程
    console.log('Deploying genome:', result.deployable);
    alert('部署功能预留，当前只输出到控制台');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* 标题 */}
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">PetriLabs · Genesis Engine</h1>
          <p className="text-gray-600 mt-2">记忆文件 → 动态基因组</p>
        </header>

        {/* 主内容区 */}
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
          {/* 上传区域 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">1. 上传记忆文件</h2>
            <FileUploader onContentChange={handleContentChange} />
          </section>

          {/* 生成按钮 */}
          <div className="flex justify-center">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !content}
              className={`
                px-8 py-3 rounded-lg font-medium text-white transition-all
                ${isGenerating || !content
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }
              `}
            >
              {isGenerating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  生成中 (预计 15-30 秒)...
                </span>
              ) : (
                '生成基因组'
              )}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 基因组预览 */}
          {result?.success && (
            <section className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">2. 基因组预览</h2>
              <GenomeVisualizer genome={result.genome} />

              {/* 操作按钮 */}
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleDownload}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  下载基因组 JSON
                </button>
                <button
                  onClick={handleDeploy}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  部署到容器 →
                </button>
              </div>
            </section>
          )}
        </div>

        {/* 页脚说明 */}
        <footer className="mt-8 text-center text-sm text-gray-500">
          <p>支持格式: JSON, TXT, MD | 最大 500KB | 63 基因 / 8 染色体</p>
          <p className="mt-1">使用 Pollinations AI 免费 API | temperature=0.3 | seed=42</p>
        </footer>
      </div>
    </div>
  );
};

export default GenesisEnginePage;
