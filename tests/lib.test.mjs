import test from 'node:test';
import assert from 'node:assert/strict';
import {clean,safeName,snippets,passwordHash,passwordVerify,noSecretUrl} from '../server/lib.mjs';
test('string validation and filenames',()=>{assert.equal(clean(' Hello ',4),'Hell');assert.equal(safeName('../ report|x.txt'),'reportx.txt')});
test('password salts differ and password verification is secure',()=>{const a=passwordHash('example123456789'),b=passwordHash('example123456789');assert.notEqual(a,b);assert.equal(passwordVerify('example123456789',a),true);assert.equal(passwordVerify('wrong',a),false)});
test('snippet search is document-grounded',()=>{const d=[{name:'Policy',text:'Guest voucher missing. Agent must follow up.'},{name:'Recipe',text:'Make coffee with beans.'}];const s=snippets(d,'voucher missing');assert.equal(s.length,1);assert.equal(s[0].title,'Policy')});
test('public https URL validation',()=>{assert.equal(noSecretUrl('https://example.com/docs'),true);assert.equal(noSecretUrl('http://localhost:8000'),false)});
