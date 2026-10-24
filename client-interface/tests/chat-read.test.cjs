const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const exports_ = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'lib/utils/chat-read.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  { exports: exports_, module: { exports: exports_ }, require: () => { throw new Error('no deps'); } },
);
const { isReaderLooking, firstUnreadIndex, markThreadRead } = exports_;

const ME = 'mentee-1';
const NOW = '2026-10-20T00:00:00.000Z';
const msg = (over) => ({ id: 'm1', senderId: 'mentor-1', messageText: 'hi', isRead: false, createdAt: NOW, ...over });
test('isReaderLooking is true when the tab is visible, even if another window has focus', () => {
  assert.equal(isReaderLooking({ visibilityState: 'visible' }), true);
  // background tab or minimised window
  assert.equal(isReaderLooking({ visibilityState: 'hidden' }), false);
  assert.equal(isReaderLooking(undefined), false);
});

test('firstUnreadIndex finds the first unread message from the other person', () => {
  const thread = [msg({ id: 'a', isRead: true, readAt: NOW }), msg({ id: 'b', senderId: ME }), msg({ id: 'c' })];
  assert.equal(firstUnreadIndex(thread, ME), 2);
  assert.equal(firstUnreadIndex([msg({ senderId: ME })], ME), -1);
});

test('a new message while the user is looking clears the divider (#801)', () => {
  const unreadWhenOpened = msg({ id: 'old' });
  const live = msg({ id: 'live' });
  assert.equal(firstUnreadIndex([unreadWhenOpened, live], ME), 0);
  assert.equal(firstUnreadIndex(markThreadRead([unreadWhenOpened, live], ME, NOW), ME), -1);
});

test('a message that arrives while the user is away keeps the divider', () => {
  // added as received, without marking it read
  const thread = [msg({ id: 'a', isRead: true, readAt: NOW }), msg({ id: 'while-away' })];
  assert.equal(firstUnreadIndex(thread, ME), 1);
});

test('sending a reply clears the divider', () => {
  const thread = [msg({ id: 'a' }), msg({ id: 'b' })];
  assert.equal(firstUnreadIndex(thread, ME), 0);
  // same as handleSendMessage: mark the thread read, then add the reply
  const reply = msg({ id: 'reply', senderId: ME });
  const afterReply = [...markThreadRead(thread, ME, NOW), reply];
  assert.equal(firstUnreadIndex(afterReply, ME), -1);
  assert.equal(afterReply[2], reply);
});

test('leaving a chat clears the divider for next time', () => {
  const thread = [msg({ id: 'a' }), msg({ id: 'b', senderId: ME }), msg({ id: 'c' })];
  assert.equal(firstUnreadIndex(markThreadRead(thread, ME, NOW), ME), -1);
});

test("markThreadRead leaves the user's own messages unread", () => {
  // their isRead flag is the other person's read receipt
  const mine = msg({ id: 'mine', senderId: ME });
  const after = markThreadRead([msg({ id: 'theirs' }), mine], ME, NOW);
  assert.equal(after.find((m) => m.id === 'mine'), mine);
  assert.equal(after.find((m) => m.id === 'mine').isRead, false);
});

test('markThreadRead keeps the original readAt of already-read messages', () => {
  const earlier = msg({ id: 'earlier', isRead: true, readAt: '2026-10-19T10:00:00.000Z' });
  const after = markThreadRead([earlier, msg({ id: 'new' })], ME, NOW);
  assert.equal(after[0], earlier);
  assert.equal(after[1].readAt, NOW);
});

test('markThreadRead returns the same array when nothing is unread', () => {
  const thread = [msg({ isRead: true, readAt: NOW }), msg({ id: 'b', senderId: ME })];
  assert.equal(markThreadRead(thread, ME, NOW), thread);
});
