// Oliveira Frota — adaptador de nuvem
// Esta base mantém a aplicação segura e funcional offline.
// A conexão real com Firebase será habilitada quando as credenciais do projeto forem configuradas.
window.OLIVEIRA_CLOUD_CONFIG = Object.freeze({
  provider: 'firebase',
  enabled: false,
  projectId: '',
  apiKey: ''
});

window.OLIVEIRA_CLOUD_ADAPTER = {
  name: 'Firebase',
  isConfigured(){
    const c = window.OLIVEIRA_CLOUD_CONFIG || {};
    return Boolean(c.enabled && c.projectId && c.apiKey);
  },
  async sync(){
    throw new Error('Firebase ainda não configurado.');
  }
};
