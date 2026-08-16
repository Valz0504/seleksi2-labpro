export interface LocalDatabaseEnvironmentNames {
  applicationDatabaseUrl: string;
  databaseName: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

function requireLocalComponent(environment: Environment, name: string): string {
  const value = environment[name];

  if (!value || value !== value.trim()) {
    throw new Error(`${name} harus tersedia untuk koneksi local database`);
  }

  return value;
}

function buildLocalDevelopmentUrl(environment: Environment, databaseName: string): string {
  const username = requireLocalComponent(environment, 'LOCAL_DB_USER');
  const password = requireLocalComponent(environment, 'LOCAL_DB_PASSWORD');
  const port = requireLocalComponent(environment, 'LOCAL_DB_PORT');

  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error('LOCAL_DB_PORT harus berupa port TCP yang valid');
  }

  const url = new URL('postgresql://localhost');
  url.username = username;
  url.password = password;
  url.port = port;
  url.pathname = `/${databaseName}`;

  return url.toString();
}

function validateDatabaseUrl(value: string, variableName: string, databaseName: string): string {
  try {
    const url = new URL(value);
    const selectedDatabase = decodeURIComponent(url.pathname.slice(1));

    if (
      (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
      !url.username ||
      !url.password ||
      !url.hostname ||
      selectedDatabase !== databaseName ||
      url.hash
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(
      `${variableName} harus berupa PostgreSQL URL yang menunjuk tepat ke database ${databaseName}`,
    );
  }
}

export function resolveLocalDatabaseUrl(
  environment: Environment,
  names: LocalDatabaseEnvironmentNames,
): string {
  const applicationUrl = environment[names.applicationDatabaseUrl];
  const containerUrl = environment['DATABASE_URL'];
  const value =
    applicationUrl ?? containerUrl ?? buildLocalDevelopmentUrl(environment, names.databaseName);
  const sourceName = applicationUrl
    ? names.applicationDatabaseUrl
    : containerUrl
      ? 'DATABASE_URL'
      : 'LOCAL_DB_*';

  return validateDatabaseUrl(value, sourceName, names.databaseName);
}
