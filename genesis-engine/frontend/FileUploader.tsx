/**
 * FileUploader 组件
 * 文件上传 + 文本粘贴二选一
 */

import React, { useState, useCallback } from 'react';

interface FileUploaderProps {
  onContentChange: (content: string, source: 'file' | 'paste') => void;
  maxSizeKB?: number;
  accept?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onContentChange,
  maxSizeKB = 500,
  accept = '.json,.txt,.md'
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [activeMode, setActiveMode] = useState<'none' | 'file' | 'paste'>('none');
  const [error, setError] = useState<string | null>(null);

  const maxSizeBytes = maxSizeKB * 1024;

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = (file: File) => {
    setError(null);
    
    // 检查文件大小
    if (file.size > maxSizeBytes) {
      setError(`文件过大，最大支持 ${maxSizeKB}KB`);
      return;
    }
    
    // 检查文件类型
    const validTypes = ['application/json', 'text/plain', 'text/markdown'];
    const validExtensions = ['.json', '.txt', '.md'];
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setError('不支持的文件格式，请上传 .json .txt .md 文件');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileName(file.name);
      setActiveMode('file');
      setPasteText(''); // 清空粘贴区
      onContentChange(content, 'file');
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPasteText(text);
    
    if (text.length > 0) {
      setActiveMode('paste');
      setFileName(null); // 清除文件选择
      onContentChange(text, 'paste');
    } else {
      setActiveMode('none');
    }
  };

  const clearFile = () => {
    setFileName(null);
    setActiveMode('none');
    onContentChange('', 'file');
  };

  return (
    <div className="space-y-4">
      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* 上传区域 */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${activeMode === 'paste' ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
          id="file-upload"
          disabled={activeMode === 'paste'}
        />
        
        <label
          htmlFor="file-upload"
          className="cursor-pointer block"
        >
          <div className="text-4xl mb-2">📁</div>
          <p className="text-gray-600 font-medium">
            {fileName ? fileName : '拖拽文件到这里，或点击上传'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            支持 {accept}，最大 {maxSizeKB}KB
          </p>
        </label>
        
        {fileName && (
          <button
            onClick={clearFile}
            className="mt-2 text-red-500 text-sm hover:text-red-700"
          >
            清除文件
          </button>
        )}
      </div>

      {/* 分隔线 */}
      <div className="flex items-center">
        <div className="flex-1 h-px bg-gray-300"></div>
        <span className="px-4 text-gray-400 text-sm">或者</span>
        <div className="flex-1 h-px bg-gray-300"></div>
      </div>

      {/* 粘贴区域 */}
      <div className={activeMode === 'file' ? 'opacity-50 pointer-events-none' : ''}>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          文本粘贴
        </label>
        <textarea
          value={pasteText}
          onChange={handlePasteChange}
          placeholder="可以直接粘贴聊天记录、记忆文件等任意文本..."
          className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={activeMode === 'file'}
        />
        <p className="text-gray-400 text-sm mt-1">
          {pasteText.length} 字符
        </p>
      </div>
    </div>
  );
};

export default FileUploader;
