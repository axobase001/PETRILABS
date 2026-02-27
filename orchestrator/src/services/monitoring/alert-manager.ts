/**
 * Alert Manager
 * Handles alert routing to various channels (Discord, Slack, Email)
 */

import axios from 'axios';
import { logger } from '../../utils/logger';
import { MonitorAlert } from '../../types';

export interface AlertChannel {
  type: 'discord' | 'slack' | 'webhook' | 'email';
  url?: string;
  config?: Record<string, any>;
}

export interface AlertManagerConfig {
  channels: AlertChannel[];
  cooldownMs?: number;
  maxRetries?: number;
}

export class AlertManager {
  private channels: AlertChannel[];
  private cooldownMs: number;
  private maxRetries: number;
  private lastAlertTime: Map<string, number> = new Map();
  private alertHistory: Array<{ timestamp: number; alert: MonitorAlert; channels: string[] }> = [];

  constructor(config: AlertManagerConfig) {
    this.channels = config.channels;
    this.cooldownMs = config.cooldownMs || 300000; // 5 minutes default
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Send alert to all configured channels
   */
  async sendAlert(alert: MonitorAlert): Promise<void> {
    const alertKey = `${alert.agentAddress}-${alert.type}`;
    const lastTime = this.lastAlertTime.get(alertKey);
    const now = Date.now();

    if (lastTime && now - lastTime < this.cooldownMs) {
      logger.debug('Alert in cooldown, skipping', { alertKey });
      return;
    }

    this.lastAlertTime.set(alertKey, now);

    const results: string[] = [];
    const errors: string[] = [];

    for (const channel of this.channels) {
      try {
        await this.sendToChannel(alert, channel);
        results.push(channel.type);
        logger.info(`Alert sent to ${channel.type}`, { alertId: alert.id });
      } catch (error) {
        errors.push(`${channel.type}: ${error}`);
        logger.error(`Failed to send alert to ${channel.type}`, { error });
      }
    }

    this.alertHistory.push({ timestamp: now, alert, channels: results });
    if (this.alertHistory.length > 1000) this.alertHistory.shift();

    if (errors.length > 0) {
      throw new Error(`Alert sending failed: ${errors.join(', ')}`);
    }
  }

  private async sendToChannel(alert: MonitorAlert, channel: AlertChannel): Promise<void> {
    switch (channel.type) {
      case 'discord':
        await this.sendDiscord(alert, channel);
        break;
      case 'slack':
        await this.sendSlack(alert, channel);
        break;
      case 'webhook':
        await this.sendWebhook(alert, channel);
        break;
      default:
        throw new Error(`Unknown channel type: ${channel.type}`);
    }
  }

  private async sendDiscord(alert: MonitorAlert, channel: AlertChannel): Promise<void> {
    if (!channel.url) throw new Error('Discord webhook URL not configured');
    const color = alert.severity === 'critical' ? 15158332 : alert.severity === 'warning' ? 16776960 : 3447003;
    const payload = {
      embeds: [{
        title: `PETRILABS Alert: ${alert.type}`,
        description: alert.message,
        color,
        fields: [
          { name: 'Agent', value: alert.agentAddress, inline: true },
          { name: 'Severity', value: alert.severity, inline: true },
          { name: 'Time', value: new Date(alert.timestamp).toISOString(), inline: true },
        ],
        footer: { text: 'PETRILABS Monitoring' },
        timestamp: new Date().toISOString(),
      }],
    };
    await this.postWithRetry(channel.url, payload);
  }

  private async sendSlack(alert: MonitorAlert, channel: AlertChannel): Promise<void> {
    if (!channel.url) throw new Error('Slack webhook URL not configured');
    const color = alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'good';
    const payload = {
      attachments: [{
        color,
        title: `PETRILABS Alert: ${alert.type}`,
        text: alert.message,
        fields: [
          { title: 'Agent', value: alert.agentAddress, short: true },
          { title: 'Severity', value: alert.severity, short: true },
        ],
        footer: 'PETRILABS Monitoring',
        ts: Math.floor(Date.now() / 1000),
      }],
    };
    await this.postWithRetry(channel.url, payload);
  }

  private async sendWebhook(alert: MonitorAlert, channel: AlertChannel): Promise<void> {
    if (!channel.url) throw new Error('Webhook URL not configured');
    const payload = {
      source: 'petrilabs', type: alert.type, severity: alert.severity,
      message: alert.message, agentAddress: alert.agentAddress,
      timestamp: alert.timestamp, id: alert.id,
    };
    await this.postWithRetry(channel.url, payload);
  }

  private async postWithRetry(url: string, payload: any, attempt = 1): Promise<void> {
    try {
      await axios.post(url, payload, { timeout: 10000 });
    } catch (error) {
      if (attempt < this.maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        return this.postWithRetry(url, payload, attempt + 1);
      }
      throw error;
    }
  }

  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }

  getStats() {
    const byChannel: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const entry of this.alertHistory) {
      for (const c of entry.channels) byChannel[c] = (byChannel[c] || 0) + 1;
      bySeverity[entry.alert.severity] = (bySeverity[entry.alert.severity] || 0) + 1;
    }
    return { totalAlerts: this.alertHistory.length, alertsByChannel: byChannel, alertsBySeverity: bySeverity };
  }
}

export default AlertManager;
