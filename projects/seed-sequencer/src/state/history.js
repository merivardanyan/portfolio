/**
 * Command stack. A command is { label, do(target), undo(target), mergeKey?, merge?(next) }.
 * Consecutive commands with the same mergeKey inside mergeWindowMs collapse into one entry,
 * so dragging the tempo slider produces a single undo step.
 */
export function createHistory({ limit = 200, mergeWindowMs = 800, now = () => Date.now() } = {}) {
  let done = []
  let undone = []
  let lastPushAt = -Infinity

  return {
    execute(target, command) {
      command.do(target)
      const top = done[done.length - 1]
      const t = now()
      const canMerge = top && command.mergeKey && top.mergeKey === command.mergeKey
        && t - lastPushAt <= mergeWindowMs && typeof top.merge === 'function'
      if (canMerge) {
        done[done.length - 1] = top.merge(command)
      } else {
        done.push(command)
        if (done.length > limit) done = done.slice(done.length - limit)
      }
      lastPushAt = t
      undone = []
      return command
    },
    undo(target) {
      const cmd = done.pop()
      if (!cmd) return null
      cmd.undo(target)
      undone.push(cmd)
      lastPushAt = -Infinity
      return cmd
    },
    redo(target) {
      const cmd = undone.pop()
      if (!cmd) return null
      cmd.do(target)
      done.push(cmd)
      lastPushAt = -Infinity
      return cmd
    },
    clear() {
      done = []
      undone = []
      lastPushAt = -Infinity
    },
    get canUndo() { return done.length > 0 },
    get canRedo() { return undone.length > 0 },
    get size() { return done.length },
  }
}
