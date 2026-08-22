import { renderToStaticMarkup } from 'react-dom/server'
import { StaffAdmin, type StaffRow } from './StaffAdmin'

// Component tests use renderToStaticMarkup (testEnvironment 'node', no jsdom):
// effects don't run, so the roster renders in its default List view — exactly
// what we assert against. Named the same way as SharedProjectBadge.test.tsx.

function row(over: Partial<StaffRow>): StaffRow {
  return {
    id: 'id-1',
    user_id: 'u-1',
    staff_role: 'ae',
    staff_roles: ['ae'],
    display_name: 'Jordan Ellis',
    first_name: 'Jordan',
    last_name: 'Ellis',
    title: null,
    phone: null,
    avatar_url: null,
    created_at: '2026-08-12T00:00:00.000Z',
    email: 'jordan@funun.studio',
    status: 'active',
    ...over,
  }
}

describe('StaffAdmin', () => {
  it('renders the header and every member with their role-pill labels', () => {
    const markup = renderToStaticMarkup(
      <StaffAdmin
        initialStaff={[
          row({ user_id: 'u-1', display_name: 'Jordan Ellis', staff_role: 'ae', staff_roles: ['ae', 'bd'] }),
          row({
            user_id: 'u-2',
            display_name: 'Alex Chen',
            email: 'alex@funun.studio',
            staff_role: 'legal',
            staff_roles: ['legal', 'tms'],
          }),
        ]}
        currentUserId="nobody"
      />
    )

    expect(markup).toContain('Team Members')
    expect(markup).toContain('Jordan Ellis')
    expect(markup).toContain('Alex Chen')
    // Multi-role labels render (from role pills and/or filter chips).
    expect(markup).toContain('Account Executive')
    expect(markup).toContain('BDT')
    expect(markup).toContain('Legal')
    expect(markup).toContain('TMS')
    // The clickable contact affordances are present.
    expect(markup).toContain('mailto:jordan@funun.studio')
  })

  it('tags the current user "You" and pending members "Pending"', () => {
    const markup = renderToStaticMarkup(
      <StaffAdmin
        initialStaff={[
          row({ user_id: 'me', display_name: 'Pete Zora', staff_role: 'leadership', staff_roles: ['leadership', 'it'] }),
          row({ user_id: 'u-2', display_name: 'Riley Park', staff_role: 'ae', staff_roles: ['ae'], status: 'pending' }),
        ]}
        currentUserId="me"
      />
    )

    expect(markup).toContain('You')
    expect(markup).toContain('Pending')
    expect(markup).toContain('Leadership')
    expect(markup).toContain('IT')
  })

  it('shows the empty state when there are no team members', () => {
    const markup = renderToStaticMarkup(<StaffAdmin initialStaff={[]} currentUserId="me" />)
    expect(markup).toContain('No team members yet')
  })

  it('shows management controls when canManage (default)', () => {
    const markup = renderToStaticMarkup(
      <StaffAdmin initialStaff={[row({ display_name: 'Jordan Ellis' })]} currentUserId="nobody" />
    )
    expect(markup).toContain('Add team member')
    expect(markup).toContain('aria-label="Manage')
  })

  it('is a read-only directory when canManage is false (Directory merge)', () => {
    const markup = renderToStaticMarkup(
      <StaffAdmin
        initialStaff={[row({ display_name: 'Jordan Ellis' })]}
        currentUserId="nobody"
        canManage={false}
      />
    )
    // The roster + contact info still render — it is the directory for everyone.
    expect(markup).toContain('Jordan Ellis')
    expect(markup).toContain('mailto:jordan@funun.studio')
    // But every management affordance is gone.
    expect(markup).not.toContain('Add team member')
    expect(markup).not.toContain('aria-label="Manage')
  })
})
