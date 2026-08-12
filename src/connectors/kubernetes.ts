// ==============================================================================
// MEI-MCP — Kubernetes Connector
// ==============================================================================

import * as k8s from '@kubernetes/client-node';
import { ConnectorError } from '../errors/index.js';
import type { UserContext } from '../auth/types.js';

export interface PodEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  lastTimestamp?: Date;
}

export interface PodDetails {
  name: string;
  namespace: string;
  phase: string;
  restarts: number;
  events: PodEvent[];
  logs: string;
}

export class KubernetesConnector {
  private readonly kc: k8s.KubeConfig;
  private readonly coreV1: k8s.CoreV1Api;

  constructor() {
    this.kc = new k8s.KubeConfig();
    
    // In production, this would use DefaultAzureCredential to fetch a token 
    // for AKS and dynamically build the kubeconfig.
    // For MVP, we load from default location (~/.kube/config) or cluster default.
    this.kc.loadFromDefault();
    this.coreV1 = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * Get failing pods in a specific namespace.
   */
  async getFailingPods(namespace: string, _context: UserContext): Promise<PodDetails[]> {
    try {
      const res = await this.coreV1.listNamespacedPod({ namespace });
      
      const failingPods = res.items.filter(pod => {
        const phase = pod.status?.phase;
        if (phase === 'Failed' || phase === 'Unknown') return true;
        
        // Check for CrashLoopBackOff or other container statuses
        const containerStatuses = pod.status?.containerStatuses || [];
        return containerStatuses.some(status => 
          status.state?.waiting?.reason === 'CrashLoopBackOff' || 
          status.state?.waiting?.reason === 'ErrImagePull' ||
          status.state?.waiting?.reason === 'ImagePullBackOff' ||
          status.restartCount > 5
        );
      });

      const details: PodDetails[] = [];
      for (const pod of failingPods) {
        if (!pod.metadata?.name) continue;
        
        const events = await this.getPodEvents(pod.metadata.name, namespace);
        const logs = await this.getPodLogs(pod.metadata.name, namespace);
        const restarts = pod.status?.containerStatuses?.reduce((acc, curr) => acc + curr.restartCount, 0) || 0;

        details.push({
          name: pod.metadata.name,
          namespace,
          phase: pod.status?.phase || 'Unknown',
          restarts,
          events,
          logs
        });
      }

      return details;
    } catch (error) {
      throw new ConnectorError(`Failed to fetch pods in namespace ${namespace}: ${error}`, 'Kubernetes');
    }
  }

  private async getPodEvents(podName: string, namespace: string): Promise<PodEvent[]> {
    try {
      const fieldSelector = `involvedObject.name=${podName}`;
      const res = await this.coreV1.listNamespacedEvent({ namespace, fieldSelector });
      
      return res.items.map(e => ({
        type: e.type || 'Unknown',
        reason: e.reason || 'Unknown',
        message: e.message || '',
        count: e.count || 1,
        lastTimestamp: e.lastTimestamp
      }));
    } catch {
      return [];
    }
  }

  private async getPodLogs(podName: string, namespace: string): Promise<string> {
    try {
      const res = await this.coreV1.readNamespacedPodLog({
        name: podName,
        namespace,
        tailLines: 50
      });
      return res;
    } catch {
      return 'Logs unavailable or pod terminated without logs.';
    }
  }
}
