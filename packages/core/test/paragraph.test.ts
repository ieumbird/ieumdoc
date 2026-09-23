import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parse,serialize,validateStructure,insertHardBreak,splitParagraph,mergeParagraphWithPrevious,getEditableDocument, type MystDocument} from './core-internal.ts';
import {projectInlineContent,inlineContentText,assertInlineContent,inlineContentToNodes} from '../src/inline.ts';

function stable(d: MystDocument) {
  validateStructure(d);
  const markdown=serialize(d), reparsed=parse(markdown);
  validateStructure(reparsed);
  assert.equal(serialize(reparsed),markdown);
  return reparsed;
}
function content(d: MystDocument,index=0) { return projectInlineContent(d.children[index])!; }
function text(d: MystDocument,index=0) { return inlineContentText(content(d,index)); }
for(const [source,offset] of [['ABCD',2],['**ABCD**',2],['*ABCD*',2],['**A*BC*D**',2],['A**BC**D',1]] as const) {
  test(`hard break preserves marks: ${source}`,()=>{
    const original=parse(source), before=serialize(original);
    const changed=insertHardBreak(original,[0],offset);
    assert.equal(text(changed),'ABCD'.slice(0,offset)+'\n'+'ABCD'.slice(offset));
    assert.deepEqual(content(stable(changed)),content(changed));
    assert.equal(serialize(original),before);
  });
  test(`split preserves marks: ${source}`,()=>{
    const original=parse(source+'\n\n# Tail');
    const changed=splitParagraph(original,[0],offset);
    assert.equal(text(changed),'ABCD'.slice(0,offset));
    assert.equal(text(changed,1),'ABCD'.slice(offset));
    assert.equal(changed.children[2].type,'heading');
    const round=stable(changed);
    assert.deepEqual(content(round),content(changed));
    assert.deepEqual(content(round,1),content(changed,1));
    assert.equal(serialize(stable(mergeParagraphWithPrevious(changed,[1]))),serialize(original));
  });
}
test('MyST observed break representation and canonical form',()=>{
  for(const source of ['A  \nB','A\\\nB']) {
    const d=parse(source);
    assert.equal(d.children[0].children?.[1].type,'break');
    assert.deepEqual(content(d),[{kind:'text',text:'A'},{kind:'break'},{kind:'text',text:'B'}]);
    assert.equal(serialize(stable(d)),'A\\\nB\n');
  }
  assertInlineContent([{kind:'break'}]);
  assert.deepEqual(inlineContentToNodes([{kind:'break'}]),[{type:'break'}]);
});
test('UTF-16 offsets count surrogate pairs as two and a break as one',()=>{
  const d=insertHardBreak(parse('A😀BC'),[0],3);
  assert.equal(text(stable(d)),'A😀\nBC');
  const split=splitParagraph(d,[0],5);
  assert.equal(text(stable(split)),'A😀\nB');
  assert.equal(text(split,1),'C');
});
test('split existing break, nested paragraph break insertion',()=>{
  const split=splitParagraph(parse('AB\\\nCD'),[0],4);
  assert.equal(text(stable(split)),'AB\nC');
  const nested=insertHardBreak(parse('> ABCD'),[0,0],2);
  stable(nested);
  assert.equal(inlineContentText(projectInlineContent(nested.children[0].children![0])!),'AB\nCD');
});
for(const offset of [0,4,5,-1,1.5,NaN,Infinity]) {
  test(`reject invalid offset ${offset}`,()=>{
    for(const operation of [insertHardBreak,splitParagraph]) assert.throws(()=>operation(parse('ABCD'),[0],offset),/offset/);
  });
}
test('paragraph operations fail closed for paths, types and unsupported inline',()=>{
  for(const operation of [insertHardBreak,splitParagraph]) {
    // Plain links are supported inline content (see link.test.ts); these forms are not.
    for(const source of ['# Heading','See {ref}`target`.','[](#target) and text','[a `code` link](u)','{download}`./file.zip` text']) assert.throws(()=>operation(parse(source),[0],2));
    for(const path of [[],[99],[-1],[0.5]]) assert.throws(()=>operation(parse('ABCD'),path,2));
  }
  assert.throws(()=>splitParagraph(parse('> ABCD'),[0,0],2),/top-level/);
  assert.throws(()=>mergeParagraphWithPrevious(parse('> ABCD'),[0,0]),/top-level/);
  for(const source of ['ABCD','# Heading\n\nABCD','$$\nx=1\n$$\n\nABCD','[](#target)\n\nABCD','ABCD\n\n[a `code` link](u)','ABCD\n\n# Heading']) {
    assert.throws(()=>mergeParagraphWithPrevious(parse(source),[source==='ABCD'?0:1]));
  }
});
test('merge adds no space and preserves rich content and breaks',()=>{
  for(const [source,expected] of [['Hello\n\nWorld','HelloWorld'],['**Hello**\n\n**World**','HelloWorld'],['**Hello**\n\n*World*','HelloWorld'],['AB\\\nCD\n\nEF\\\nGH','AB\nCDEF\nGH']]) {
    const changed=mergeParagraphWithPrevious(parse(source),[1]);
    assert.equal(text(stable(changed)),expected);
    assert.deepEqual(content(stable(changed)),content(changed));
  }
});
test('unpersistable split boundaries are rejected without placeholders',()=>{
  assert.throws(()=>splitParagraph(parse('A\\\nBC'),[0],2),/round-trip/);
  assert.equal(text(stable(splitParagraph(parse('A\\\nBC'),[0],1)),1),'\nBC');
  assert.throws(()=>splitParagraph(parse('**AB CD**'),[0],3),/round-trip/);
});
test('unrelated technical semantics survive each operation despite shifted paths',()=>{
  const original=parse(readFileSync(new URL('./fixtures/technical-document.md',import.meta.url),'utf8'));
  const index=getEditableDocument(original).blocks.findIndex(b=>b.block==='paragraph'&&b.editable);
  const preserved=original.children.filter((_,i)=>i!==index);
  for(const changed of [insertHardBreak(original,[index],2),splitParagraph(original,[index],2),mergeParagraphWithPrevious(splitParagraph(original,[index],2),[index+1])]) {
    const count=changed.children.length-original.children.length+1;
    const untouched=changed.children.filter((_,i)=>i<index||i>=index+count);
    assert.deepEqual(untouched,preserved);
    const round=stable(changed);
    const after=round.children.filter((_,i)=>i<index||i>=index+count);
    assert.equal(serialize({type:'root',children:after}),serialize({type:'root',children:preserved}));
  }
});

test("empty and whitespace-only persistent split results are rejected", () => {
  const document: MystDocument = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: " A" }] }] };
  assert.throws(() => splitParagraph(document, [0], 1), /non-empty/);
});

test("UTF-16 offsets inside surrogate pairs fail closed before UTF-8 persistence", () => {
  for (const operation of [splitParagraph, insertHardBreak]) {
    assert.throws(() => operation(parse("A😀B"), [0], 2), /surrogate/);
  }
});

test("split explicitly preserves both nested marks on each side", () => {
  const document = splitParagraph(parse("**A*BC*D**"), [0], 2);
  assert.deepEqual(content(document), [
    { kind: "strong", children: [{ kind: "text", text: "A" }, { kind: "emphasis", children: [{ kind: "text", text: "B" }] }] },
  ]);
  assert.deepEqual(content(document, 1), [
    { kind: "strong", children: [{ kind: "emphasis", children: [{ kind: "text", text: "C" }] }, { kind: "text", text: "D" }] },
  ]);
  stable(document);
});
