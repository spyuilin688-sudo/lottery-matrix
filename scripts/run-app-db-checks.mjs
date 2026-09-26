import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { assertLocalAppTestDatabase,localPostgresEnvironment } from '../tests/helpers/app-postgres.mjs';
const args=process.argv.slice(2);
if(args.length!==4 || args[0]!=='--test' || args[1]!=='tests/app-isolation-postgres.test.mjs' || args[2]!=='--database-url-env' || !/^[A-Z][A-Z0-9_]+$/.test(args[3])) throw new Error('Use --test tests/app-isolation-postgres.test.mjs --database-url-env APP_TEST_DATABASE_URL');
const source=process.env[args[3]];
if(!source) throw new Error('App test database URL not supplied; no database was contacted');
const url=assertLocalAppTestDatabase(source);
if(spawnSync('psql',['--version'],{stdio:'ignore'}).status!==0) throw new Error('psql is unavailable; real Postgres verification was not run');
const database='matrix_app_test_'+randomUUID().replaceAll('-','');
const execute=sql=>{
 const result=spawnSync('psql',['-X','-q','-v','ON_ERROR_STOP=1',source],{input:sql,encoding:'utf8',env:localPostgresEnvironment()});
 if(result.status!==0) throw new Error('Local isolated test database setup/cleanup failed: '+result.stderr);
};
execute(`create database ${database};`);
try {
 url.pathname='/'+database;
 const result=spawnSync(process.execPath,['--test',args[1]],{stdio:'inherit',env:{...process.env,APP_TEST_DATABASE_URL:url.href}});
 process.exitCode=result.status??1;
} finally {execute(`drop database ${database} with (force);`);}
