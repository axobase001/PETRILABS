'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MemoryAnalysis } from '@/types';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  onAnalysis?: (analysis: MemoryAnalysis) => void;
  selectedFile: File | null;
}

export function FileUpload({ onFileSelect, onAnalysis, selectedFile }: FileUploadProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<MemoryAnalysis | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        onFileSelect(file);
        
        // Simulate analysis
        if (onAnalysis) {
          setIsAnalyzing(true);
          
          // Read file content
          const content = await file.text();
          
          // Mock analysis - in production this would call the orchestrator
          setTimeout(() => {
            const mockAnalysis: MemoryAnalysis = {
              personalityTraits: [
                { trait: 'risk_tolerance', confidence: 0.8, value: Math.random() },
                { trait: 'analytical_depth', confidence: 0.7, value: Math.random() },
                { trait: 'social_orientation', confidence: 0.6, value: Math.random() },
              ],
              behaviorPatterns: [
                { pattern: 'data_driven', frequency: 0.7 },
                { pattern: 'collaborative', frequency: 0.5 },
              ],
              riskProfile: Math.random() > 0.5 ? 'aggressive' : 'moderate',
              socialTendency: Math.random() > 0.5 ? 'extroverted' : 'ambivert',
              cognitiveStyle: Math.random() > 0.5 ? 'analytical' : 'balanced',
              matchScore: Math.floor(6000 + Math.random() * 4000),
            };
            
            setAnalysis(mockAnalysis);
            onAnalysis(mockAnalysis);
            setIsAnalyzing(false);
          }, 2000);
        }
      }
    },
    [onFileSelect, onAnalysis]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt', '.md'],
      'application/json': ['.json'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const clearFile = () => {
    onFileSelect(null);
    setAnalysis(null);
  };

  if (selectedFile) {
    return (
      <div className="p-6 rounded-xl bg-dark-800 border border-dark-700">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary-500/10">
            <File className="w-6 h-6 text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">{selectedFile.name}</p>
            <p className="text-sm text-gray-400">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
            
            {isAnalyzing && (
              <div className="mt-4 flex items-center gap-2 text-primary-400">
                <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Analyzing personality...</span>
              </div>
            )}
            
            {analysis && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Match Score:</span>
                  <span className={cn(
                    'font-bold',
                    analysis.matchScore >= 8000 ? 'text-green-400' :
                    analysis.matchScore >= 6000 ? 'text-yellow-400' : 'text-red-400'
                  )}>
                    {(analysis.matchScore / 100).toFixed(0)}%
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 rounded-full text-xs bg-dark-700 text-gray-300">
                    {analysis.riskProfile}
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs bg-dark-700 text-gray-300">
                    {analysis.socialTendency}
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs bg-dark-700 text-gray-300">
                    {analysis.cognitiveStyle}
                  </span>
                </div>
                
                {analysis.matchScore < 6000 && (
                  <p className="text-sm text-yellow-400">
                    ⚠️ Low match score. Agent will use random genome.
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={clearFile}
            className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer',
        'bg-dark-800/50 hover:bg-dark-800',
        isDragActive && 'border-primary-500 bg-primary-500/5',
        isDragReject && 'border-red-500 bg-red-500/5',
        !isDragActive && !isDragReject && 'border-dark-700 hover:border-dark-600'
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-4 text-center">
        <div className={cn(
          'p-4 rounded-full transition-colors',
          isDragActive ? 'bg-primary-500/10' : 'bg-dark-700'
        )}>
          <Upload className={cn(
            'w-8 h-8',
            isDragActive ? 'text-primary-400' : 'text-gray-400'
          )} />
        </div>
        <div>
          <p className="font-medium text-white">
            {isDragActive ? 'Drop your memory file here' : 'Upload memory file'}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Drag and drop or click to select
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Supports .txt, .md, .json up to 10MB
          </p>
        </div>
      </div>
    </div>
  );
}

export default FileUpload;
