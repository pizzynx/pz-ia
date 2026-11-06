export const CHAT_STATES = Object.freeze({
  IDLE: "idle",
  RECEIVING: "receiving",
  ANALYZING: "analyzing",
  THINKING: "thinking",
  SEARCHING: "searching",
  EXECUTING: "executing",
  GENERATING: "generating",
  SENDING: "sending",
  QUEUED: "queued",
  WAITING: "waiting",
  RECONNECTING: "reconnecting",
  COMPLETED: "completed",
  ERROR: "error",
  INTERRUPTED: "interrupted"
});

const TRANSITIONS = Object.freeze({
  idle: ["receiving"],
  receiving: ["queued", "thinking", "error", "interrupted"],
  queued: ["thinking", "error", "interrupted"],
  analyzing: ["thinking", "searching", "executing", "waiting", "error", "interrupted"],
  thinking: ["analyzing", "searching", "executing", "generating", "sending", "waiting", "reconnecting", "completed", "error", "interrupted"],
  searching: ["thinking", "executing", "generating", "sending", "waiting", "reconnecting", "completed", "error", "interrupted"],
  executing: ["thinking", "searching", "generating", "sending", "waiting", "reconnecting", "completed", "error", "interrupted"],
  generating: ["sending", "reconnecting", "completed", "error", "interrupted"],
  sending: ["reconnecting", "completed", "error", "interrupted"],
  waiting: ["thinking", "searching", "executing", "reconnecting", "completed", "error", "interrupted"],
  reconnecting: ["thinking", "searching", "executing", "generating", "sending", "error", "interrupted"],
  completed: [],
  error: [],
  interrupted: []
});

export class ChatStateMachine {
  constructor(operationId, onTransition = () => {}) {
    if (typeof operationId !== "string" || !operationId.trim()) {
      throw new TypeError("Cada operação precisa de um identificador único.");
    }
    this.operationId = operationId;
    this.state = CHAT_STATES.IDLE;
    this.history = [{ operationId, from: null, to: CHAT_STATES.IDLE, at: Date.now(), detail: "" }];
    this.onTransition = onTransition;
  }

  canTransition(nextState) {
    return (TRANSITIONS[this.state] || []).includes(nextState);
  }

  transition(nextState, detail = "") {
    if (!Object.values(CHAT_STATES).includes(nextState)) {
      throw new TypeError(`Estado desconhecido: ${nextState}`);
    }
    if (!this.canTransition(nextState)) {
      throw new Error(`Transição inválida para a operação ${this.operationId}: ${this.state} → ${nextState}`);
    }
    const event = Object.freeze({
      operationId: this.operationId,
      from: this.state,
      to: nextState,
      at: Date.now(),
      detail: String(detail || "")
    });
    this.state = nextState;
    this.history.push(event);
    this.onTransition(event);
    return event;
  }
}

export class SerialTaskQueue {
  #items = [];

  get size() {
    return this.#items.length;
  }

  enqueue(task, { priority = false } = {}) {
    if (!task || typeof task.id !== "string" || !task.id) {
      throw new TypeError("Cada item da fila precisa de um identificador de operação.");
    }
    if (this.#items.some(item => item.id === task.id)) {
      throw new Error(`A operação ${task.id} já está na fila.`);
    }
    if (priority) this.#items.unshift(task);
    else this.#items.push(task);
    return this.positionOf(task.id);
  }

  dequeue() {
    return this.#items.shift() || null;
  }

  removeById(operationId) {
    const index = this.#items.findIndex(item => item.id === operationId);
    return index < 0 ? null : this.#items.splice(index, 1)[0];
  }

  positionOf(operationId) {
    const index = this.#items.findIndex(item => item.id === operationId);
    return index < 0 ? 0 : index + 1;
  }

  positionForMessage(messageId) {
    const index = this.#items.findIndex(item => item.userMessage?.id === messageId);
    return index < 0 ? 0 : index + 1;
  }
}

export function getChatStateTransitions(state) {
  return [...(TRANSITIONS[state] || [])];
}
