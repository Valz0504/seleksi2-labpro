import 'server-only';

import {
  type RelyingApplicationConfig,
  validateRelyingApplicationEnvironment,
} from './environment';

let cachedConfig: RelyingApplicationConfig | undefined;

export function getRelyingApplicationConfig(): RelyingApplicationConfig {
  cachedConfig ??= validateRelyingApplicationEnvironment(process.env, {
    applicationName: 'App B',
    clientId: 'APP_B_CLIENT_ID',
    clientSecret: 'APP_B_CLIENT_SECRET',
    redirectUri: 'APP_B_REDIRECT_URI',
    launchUrl: 'APP_B_LAUNCH_URL',
    oauthTransactionCookieName: 'app_b_oauth_transaction',
  });

  return cachedConfig;
}
