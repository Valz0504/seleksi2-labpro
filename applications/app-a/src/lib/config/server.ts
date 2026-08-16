import 'server-only';

import {
  type RelyingApplicationConfig,
  validateRelyingApplicationEnvironment,
} from './environment';

let cachedConfig: RelyingApplicationConfig | undefined;

export function getRelyingApplicationConfig(): RelyingApplicationConfig {
  cachedConfig ??= validateRelyingApplicationEnvironment(process.env, {
    applicationName: 'App A',
    clientId: 'APP_A_CLIENT_ID',
    clientSecret: 'APP_A_CLIENT_SECRET',
    redirectUri: 'APP_A_REDIRECT_URI',
    launchUrl: 'APP_A_LAUNCH_URL',
    oauthTransactionCookieName: 'app_a_oauth_transaction',
    localSessionCookieName: 'app_a_local_session',
  });

  return cachedConfig;
}
