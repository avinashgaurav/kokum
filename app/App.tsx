import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StoreProvider } from './src/store/useStore';
import { TodayScreen } from './src/screens/TodayScreen';
import { PantryScreen } from './src/screens/PantryScreen';
import { OrderScreen } from './src/screens/OrderScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { Mark } from './src/components/Mark';
import { color, type } from './src/theme';

/**
 * Three tabs, never more: Today, Pantry, Order. Setup rides along as a fourth entry only
 * because a tab-only shell has nowhere else to put it; when a header lands it moves behind
 * a profile icon. Capture is a modal off the Pantry stack, not a tab, because adding
 * groceries is an action rather than a place. See UI-UX.md.
 */
const Tab = createBottomTabNavigator();
const PantryStack = createNativeStackNavigator();

const navTheme: Theme = {
  dark: false,
  colors: {
    primary: color.petrol,
    background: color.canvas,
    card: color.card,
    text: color.ink,
    border: color.line,
    notification: color.stateNeed,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
};

function PantryFlow() {
  return (
    <PantryStack.Navigator screenOptions={{ headerShown: false }}>
      <PantryStack.Screen name="PantryHome" component={PantryScreen} />
      <PantryStack.Screen
        name="Capture"
        component={CaptureScreen}
        options={{ presentation: 'modal' }}
      />
    </PantryStack.Navigator>
  );
}

function TabGlyph({ focused, filled }: { focused: boolean; filled: number }) {
  return (
    <Mark
      size={24}
      segments={6}
      filled={filled}
      on={focused ? color.petrol : color.muted}
      off={focused ? color.petrolPale : color.line}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="dark" />
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: color.petrol,
              tabBarInactiveTintColor: color.muted,
              tabBarStyle: {
                backgroundColor: color.card,
                borderTopColor: color.lineSoft,
                height: 62,
                paddingTop: 6,
              },
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            }}
          >
            <Tab.Screen
              name="Today"
              component={TodayScreen}
              options={{ tabBarIcon: ({ focused }) => <TabGlyph focused={focused} filled={6} /> }}
            />
            <Tab.Screen
              name="Pantry"
              component={PantryFlow}
              options={{ tabBarIcon: ({ focused }) => <TabGlyph focused={focused} filled={4} /> }}
            />
            <Tab.Screen
              name="Order"
              component={OrderScreen}
              options={{ tabBarIcon: ({ focused }) => <TabGlyph focused={focused} filled={2} /> }}
            />
            <Tab.Screen
              name="Setup"
              component={SettingsScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type.label, { color: focused ? color.petrol : color.muted }]}>
                      SET
                    </Text>
                  </View>
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
