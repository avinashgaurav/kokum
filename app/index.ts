import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { inject } from '@vercel/analytics';
import App from './App';

// Vercel Web Analytics runs on the web build only; native builds skip it.
if (Platform.OS === 'web') {
  inject();
}

registerRootComponent(App);
