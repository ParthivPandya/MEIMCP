// ==============================================================================
// MEI-MCP — Infrastructure Agent
// ==============================================================================

import type { UserContext } from '../auth/types.js';
import { KubernetesConnector, type PodDetails } from '../connectors/kubernetes.js';

export interface InfrastructureInvestigationResult {
  clusterStatus: string;
  failingComponents: PodDetails[];
  rootCause: string;
  recommendedActions: string[];
}

export class InfrastructureInvestigationAgent {
  private readonly k8s: KubernetesConnector;

  constructor() {
    this.k8s = new KubernetesConnector();
  }

  async investigate(
    namespace: string,
    context: UserContext
  ): Promise<InfrastructureInvestigationResult> {
    const failingPods = await this.k8s.getFailingPods(namespace, context);

    if (failingPods.length === 0) {
      return {
        clusterStatus: 'Healthy',
        failingComponents: [],
        rootCause: 'No active failures detected in the specified namespace.',
        recommendedActions: ['Monitor system metrics', 'Check upstream dependencies']
      };
    }

    // Basic heuristic RCA for infrastructure
    let rootCause = 'Multiple infrastructure failures detected.';
    const recommendedActions = [];

    const firstPod = failingPods[0]!;
    const logStr = firstPod.logs.toLowerCase();
    const eventStr = firstPod.events.map(e => e.message.toLowerCase()).join(' ');

    if (logStr.includes('oomkilled') || eventStr.includes('oomkilled')) {
      rootCause = `Memory exhaustion detected on pod ${firstPod.name} (OOMKilled).`;
      recommendedActions.push('Increase memory limits/requests in the deployment manifest.');
      recommendedActions.push('Check application for memory leaks.');
    } else if (eventStr.includes('imagepullbackoff') || eventStr.includes('errimagepull')) {
      rootCause = `Failed to pull container image for pod ${firstPod.name}.`;
      recommendedActions.push('Verify the image tag exists in the container registry.');
      recommendedActions.push('Check image pull secrets and ACR permissions.');
    } else if (firstPod.restarts > 5) {
      rootCause = `Pod ${firstPod.name} is crash looping (${firstPod.restarts} restarts).`;
      recommendedActions.push('Review container startup logs for immediate crashes.');
      recommendedActions.push('Check readiness/liveness probe configuration.');
    } else {
      rootCause = `Application error causing pod termination in ${firstPod.name}.`;
      recommendedActions.push('Review application logs for unhandled exceptions.');
    }

    return {
      clusterStatus: 'Degraded',
      failingComponents: failingPods,
      rootCause,
      recommendedActions
    };
  }
}
