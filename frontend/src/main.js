import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'md-editor-v3/lib/style.css';
import App from './App.vue';
import router from './router';
import { useAppStore } from './stores/app';
import './styles/index.css';
const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
const appStore = useAppStore(pinia);
appStore.initializeAppearance();
app.use(router).use(ElementPlus).mount('#app');
//# sourceMappingURL=main.js.map