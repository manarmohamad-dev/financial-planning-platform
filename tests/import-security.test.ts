import {describe,it,expect} from 'vitest';
import {parseFile} from '../packages/imports/src/parser.js';
import {zip} from './zip-fixtures.js';
describe('M4 hostile XLSX archives',()=>{
 it('rejects entity-encoded external relationship attributes',async()=>{await expect(parseFile('unsafe.xlsx',zip([['xl/_rels/test.rels','<Relationships><Relationship TargetMode="&#69;xternal" Target="https://example.invalid"/></Relationships>']]))).rejects.toMatchObject({code:'ACTIVE_CONTENT'});});
 it.each(['xl/vbaProject.bin','xl/externalLinks/externalLink1.xml','xl/embeddings/object.bin','xl/activeX/control.xml'])('rejects active part %s',async name=>{await expect(parseFile('unsafe.xlsx',zip([[name,'unsafe']]))).rejects.toMatchObject({code:'ACTIVE_CONTENT'});});
 it.each(['<worksheet><f>WEBSERVICE("https://example.invalid")</f></worksheet>','<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>'])('rejects formulas or external references without execution %s',async xml=>{await expect(parseFile('unsafe.xlsx',zip([['xl/test.xml',xml]]))).rejects.toMatchObject({code:'ACTIVE_CONTENT'});});
 it('rejects XML entity declarations',async()=>{await expect(parseFile('unsafe.xlsx',zip([['xl/test.xml','<!DOCTYPE a [<!ENTITY x "hello">]><a>&x;</a>']]))).rejects.toMatchObject({code:'XML_ENTITIES'});});
 it('rejects deeply nested XML',async()=>{await expect(parseFile('unsafe.xlsx',zip([['xl/test.xml','<a>'.repeat(42)+'</a>'.repeat(42)]]))).rejects.toMatchObject({code:'XML_DEPTH'});});
 it('rejects malformed XML',async()=>{await expect(parseFile('unsafe.xlsx',zip([['xl/test.xml','<a><b></a>']]))).rejects.toMatchObject({code:'XML_INVALID'});});
 it('rejects archive traversal without extracting',async()=>{await expect(parseFile('unsafe.xlsx',zip([['../escape.xml','x']]))).rejects.toThrow();});
 it('rejects duplicate archive members',async()=>{await expect(parseFile('unsafe.xlsx',zip([['xl/a.xml','<a/>'],['xl/a.xml','<a/>']]))).rejects.toMatchObject({code:'ARCHIVE_PATH'});});
 it('rejects encrypted archives',async()=>{await expect(parseFile('unsafe.xlsx',zip([['xl/a.xml','x']],false,true))).rejects.toMatchObject({code:'ENCRYPTED_UNSUPPORTED'});});
 it('bounds decompressed part size even when compressed upload is small',async()=>{const b=zip([['xl/a.xml',Buffer.alloc(9*1024*1024,32)]],true);expect(b.length).toBeLessThan(20000);await expect(parseFile('bomb.xlsx',b)).rejects.toMatchObject({code:'ARCHIVE_LIMIT'});});
 it('bounds archive entry count',async()=>{await expect(parseFile('many.xlsx',zip(Array.from({length:251},(_,i)=>[`xl/${i}.xml`,'<a/>'])))).rejects.toMatchObject({code:'ARCHIVE_LIMIT'});});
});
