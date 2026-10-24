import {describe,it,expect} from 'vitest';
import {Client} from 'pg';
import {databaseOptions} from './database-options.js';
const env={NODE_ENV:'production',DATABASE_SSL:'true',DATABASE_URL:'postgresql://synthetic:synthetic@localhost:5432/kopa_padi_p2_e2e'};
describe('database TLS boundary',()=>{
 it('reproduces pg URL overriding explicit certificate policy without connecting',()=>{
  const client=new Client({connectionString:env.DATABASE_URL+'?sslmode=disable',ssl:{rejectUnauthorized:true}});
  expect((client as unknown as {connectionParameters:{ssl:unknown;host:string}}).connectionParameters.ssl).toBe(false);
 });
 it.each(['sslmode=disable','sslmode=no-verify','sslcert=x','sslrootcert=x','host=elsewhere','port=9999','options=-csearch_path=private','SSLMode=disable'])('rejects URL override %s without leaking URL',query=>{
  expect(()=>databaseOptions({...env,DATABASE_URL:env.DATABASE_URL+'?'+query})).toThrow('Database URL connection overrides are forbidden');
 });
 it('retains certificate and default hostname validation in effective pg options',()=>{
  const opts=databaseOptions(env);const client=new Client(opts);
  expect((client as unknown as {connectionParameters:{ssl:unknown;host:string}}).connectionParameters.ssl).toEqual({rejectUnauthorized:true});
  expect((client as unknown as {connectionParameters:{ssl:unknown;host:string}}).connectionParameters.host).toBe('localhost');
 });
 it('refuses production plaintext',()=>expect(()=>databaseOptions({...env,DATABASE_SSL:'false'})).toThrow());
});
