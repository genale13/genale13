import { expect, test } from 'claude-code/testing'

const MSG = {
  plugin: 'status-colors',
  component: 'AssistantMessage',
  props: { isFirstOfReply: true },
} as const

const TEXT = [
  'Here is the report.',
  '✅ Build passed',
  '- ❌ **Login** test failed',
  '⚠️ Deploy not decided',
  '```',
  '✅ inside code stays plain',
  '```',
].join('\n')

test('marked lines are drawn green, red and yellow on every surface', async $ => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...MSG, surface, props: { ...MSG.props, text: TEXT } })

    const ok = await ui.find({ type: 'Text', text: /Build passed/ })
    const bad = await ui.find({ type: 'Text', text: /Login/ })
    const open = await ui.find({ type: 'Text', text: /Deploy/ })
    expect(ok?.props.color).toBe('success')
    expect(bad?.props.color).toBe('error')
    expect(bad?.text).toBe('- ❌ Login test failed')
    expect(open?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /inside code/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('a reply with no markers is left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...MSG, surface: 'desktop', props: { ...MSG.props, text: 'Just words.' } })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
