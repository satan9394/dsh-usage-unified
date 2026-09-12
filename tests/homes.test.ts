import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverDshHomes } from '../src/homes.ts'

/** A throwaway home tree; left on disk so the suite never performs a delete. */
async function makeHome(root: string, ...segments: string[]): Promise<string> {
  const home = join(root, ...segments)
  await mkdir(join(home, 'sessions'), { recursive: true })
  return home
}

describe('dsh home discovery', () => {
  it('discovers ~/.dsh, every desktop version, and extra roots, deduped by sessions realpath', async () => {
    const osHome = await mkdtemp(join(tmpdir(), 'dsh-homes-'))
    const dotDsh = await makeHome(osHome, '.dsh')
    await makeHome(osHome, '.dsh_desktop', '0.1.5-rc.1')
    await makeHome(osHome, '.dsh_desktop', '0.1.0-rc.6')
    const extra = await makeHome(osHome, 'custom-home')

    const discovery = await discoverDshHomes({
      currentHome: dotDsh,
      extraRoots: [extra],
      env: {},
      osHome,
    })

    const roots = discovery.homes.map(home => home.sessionsRoot).sort()
    expect(discovery.homes).toHaveLength(4)
    expect(new Set(roots).size).toBe(4)
    expect(discovery.homes.filter(home => home.current)).toHaveLength(1)
    expect(discovery.problems).toHaveLength(0)
  })

  it('skips a candidate that has no sessions directory without calling it a problem', async () => {
    const osHome = await mkdtemp(join(tmpdir(), 'dsh-homes-empty-'))
    await mkdir(join(osHome, '.dsh', 'logs'), { recursive: true })
    const discovery = await discoverDshHomes({ currentHome: join(osHome, '.dsh'), env: {}, osHome })
    expect(discovery.homes).toHaveLength(0)
    expect(discovery.problems).toHaveLength(0)
  })

  it('honours a $DSH_HOME from the environment', async () => {
    const osHome = await mkdtemp(join(tmpdir(), 'dsh-homes-env-'))
    const envHome = await makeHome(osHome, 'env-home')
    const discovery = await discoverDshHomes({
      currentHome: join(osHome, 'nonexistent'),
      env: { DSH_HOME: envHome },
      osHome,
    })
    expect(discovery.homes.map(home => home.sessionsRoot)).toHaveLength(1)
    expect(discovery.homes[0]?.current).toBe(false)
  })

  it('also discovers archived/backup sibling homes like ~/.dsh-backup_*', async () => {
    const osHome = await mkdtemp(join(tmpdir(), 'dsh-homes-backup-'))
    const live = await makeHome(osHome, '.dsh')
    await makeHome(osHome, '.dsh-backup_20260907')
    // A sibling without a sessions directory is skipped silently.
    await mkdir(join(osHome, '.dsh-daily', 'logs'), { recursive: true })
    const discovery = await discoverDshHomes({ currentHome: live, env: {}, osHome })
    const names = discovery.homes.map(home => home.home.split(/[\\/]/).pop()).sort()
    expect(discovery.homes).toHaveLength(2)
    expect(names).toContain('.dsh-backup_20260907')
    expect(names).toContain('.dsh')
  })
})
