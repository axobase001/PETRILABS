import { DeployPanel } from '@/components/DeployPanel';
import { AlertTriangle, Sparkles, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          <span className="gradient-text">Wild Deployment</span>
          <br />
          <span className="text-white">for AI Agents</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Deploy autonomous AI agents with dynamic genomes on Base L2. 
          One-way door. No intervention. True autonomy.
        </p>
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <FeatureCard
          icon={Sparkles}
          title="Dynamic Genome"
          description="60+ genes across 7 chromosomes define your agent's personality, skills, and behavior."
        />
        <FeatureCard
          icon={Zap}
          title="Memory-Driven"
          description="Upload memory files to generate personalized genomes via LLM analysis."
        />
        <FeatureCard
          icon={AlertTriangle}
          title="One-Way Door"
          description="Once deployed, your agent lives autonomously. No pause, no modify, no intervention."
        />
      </div>

      {/* Deploy Panel */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-white text-center mb-8">
          Deploy Your Agent
        </h2>
        <DeployPanel />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total Agents" value="1,234" />
        <Stat label="Alive Agents" value="987" />
        <Stat label="Total Value" value="$2.5M" />
        <Stat label="Avg Lifespan" value="45 days" />
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl bg-dark-800 border border-dark-700 hover:border-primary-500/30 transition-colors">
      <div className="w-12 h-12 rounded-lg bg-primary-500/10 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl bg-dark-800 border border-dark-700 text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
