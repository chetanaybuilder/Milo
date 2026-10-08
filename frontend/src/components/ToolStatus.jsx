const LABELS = {
  IDLE: 'MILO ONLINE', LISTENING: 'LISTENING', THINKING: 'THINKING',
  SPEAKING: 'SPEAKING', ERROR: 'SOMETHING WENT WRONG',
};

export function statusLabel(state, tool) {
  if (state === 'TOOL_USE') return tool === 'weather' ? 'CHECKING WEATHER' : 'RESEARCHING';
  return LABELS[state] || 'MILO ONLINE';
}

export default function ToolStatus({ state, tool }) {
  return (
    <p className={`status status-${state.toLowerCase()}`} role="status" aria-live="polite">
      {statusLabel(state, tool)}
    </p>
  );
}
