// ==============================================================================
// MEI-MCP — Azure Container Apps Bicep Template
// ==============================================================================

param location string = resourceGroup().location
param environmentName string
param containerAppName string
param registryLoginServer string
param imageName string
param keyVaultName string

resource env 'Microsoft.App/managedEnvironments@2022-10-01' = {
  name: environmentName
  location: location
  properties: {
    zoneRedundant: false
  }
}

resource app 'Microsoft.App/containerApps@2022-10-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
      }
      secrets: [
        {
          name: 'entra-client-secret'
          keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/entraClientSecret'
          identity: 'SystemAssigned'
        }
      ]
      registries: [
        {
          server: registryLoginServer
          identity: 'SystemAssigned'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'mei-mcp'
          image: '${registryLoginServer}/${imageName}:latest'
          env: [
            {
              name: 'PORT'
              value: '3001'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'ENTRA_CLIENT_SECRET'
              secretRef: 'entra-client-secret'
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2.0Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}
