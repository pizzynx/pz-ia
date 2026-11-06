import test from "node:test";
import assert from "node:assert/strict";
import { ChatStateMachine, CHAT_STATES, SerialTaskQueue, getChatStateTransitions } from "../public/chat-state.js";

test("exige identificador de operação", () => {
  assert.throws(() => new ChatStateMachine(""), /identificador único/i);
});

test("aceita o caminho de uma mensagem enfileirada até a conclusão", () => {
  const events = [];
  const machine = new ChatStateMachine("operation-0001", event => events.push(event));
  machine.transition(CHAT_STATES.RECEIVING, "mensagem recebida");
  machine.transition(CHAT_STATES.QUEUED, "na fila");
  machine.transition(CHAT_STATES.THINKING, "aguardando modelo");
  machine.transition(CHAT_STATES.SENDING, "primeiro trecho recebido");
  machine.transition(CHAT_STATES.COMPLETED, "resposta concluída");

  assert.equal(machine.state, CHAT_STATES.COMPLETED);
  assert.equal(machine.history.length, 6);
  assert.equal(events.length, 5);
  assert.equal(events.at(-1).to, CHAT_STATES.COMPLETED);
  assert.equal(events.at(-1).operationId, "operation-0001");
});

test("rejeita transições inválidas sem mudar o estado", () => {
  const machine = new ChatStateMachine("operation-0002");
  assert.throws(() => machine.transition(CHAT_STATES.SENDING), /Transição inválida/);
  assert.equal(machine.state, CHAT_STATES.IDLE);
  machine.transition(CHAT_STATES.RECEIVING);
  machine.transition(CHAT_STATES.THINKING);
  machine.transition(CHAT_STATES.COMPLETED);
  assert.throws(() => machine.transition(CHAT_STATES.THINKING), /Transição inválida/);
  assert.equal(machine.state, CHAT_STATES.COMPLETED);
});

test("permite cancelar uma mensagem antes de sair da fila", () => {
  const machine = new ChatStateMachine("operation-0003");
  machine.transition(CHAT_STATES.RECEIVING);
  machine.transition(CHAT_STATES.QUEUED);
  machine.transition(CHAT_STATES.INTERRUPTED, "removida da fila");
  assert.equal(machine.state, CHAT_STATES.INTERRUPTED);
  assert.deepEqual(getChatStateTransitions(CHAT_STATES.INTERRUPTED), []);
});

test("não expõe a lista interna de transições", () => {
  const transitions = getChatStateTransitions(CHAT_STATES.THINKING);
  transitions.length = 0;
  assert.ok(getChatStateTransitions(CHAT_STATES.THINKING).includes(CHAT_STATES.SENDING));
});

test("processa mensagens enfileiradas em FIFO e informa sua posição", () => {
  const queue = new SerialTaskQueue();
  const first = { id: "job-1", userMessage: { id: "msg-1" } };
  const second = { id: "job-2", userMessage: { id: "msg-2" } };
  queue.enqueue(first);
  queue.enqueue(second);

  assert.equal(queue.size, 2);
  assert.equal(queue.positionForMessage("msg-2"), 2);
  assert.equal(queue.dequeue(), first);
  assert.equal(queue.positionForMessage("msg-2"), 1);
  assert.equal(queue.dequeue(), second);
  assert.equal(queue.dequeue(), null);
});

test("uma solicitação de interrupção pode priorizar o novo pedido sem reordenar o restante da fila", () => {
  const queue = new SerialTaskQueue();
  const first = { id: "job-1" }, second = { id: "job-2" }, urgent = { id: "job-priority" };
  queue.enqueue(first);
  queue.enqueue(second);
  queue.enqueue(urgent, { priority: true });

  assert.equal(queue.dequeue(), urgent);
  assert.equal(queue.dequeue(), first);
  assert.equal(queue.dequeue(), second);
});

test("permite remover um pedido pendente sem tocar nas demais mensagens", () => {
  const queue = new SerialTaskQueue();
  const first = { id: "job-1" }, second = { id: "job-2" };
  queue.enqueue(first);
  queue.enqueue(second);

  assert.equal(queue.removeById("job-1"), first);
  assert.equal(queue.removeById("missing"), null);
  assert.equal(queue.size, 1);
  assert.equal(queue.dequeue(), second);
});

test("recusa identificadores duplicados dentro da fila", () => {
  const queue = new SerialTaskQueue();
  queue.enqueue({ id: "job-1" });
  assert.throws(() => queue.enqueue({ id: "job-1" }), /já está na fila/);
});
