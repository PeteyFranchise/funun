# One Identity, Many Roles — the Funūn account, workspace, and access model

**Status:** canonical product and engineering doctrine. Owner-approved September 4, 2026.

## The one-line version

> A person has one Funūn identity. Professional roles describe the person; workspace relationships grant access; project records establish authority and ownership.

Artist, songwriter, producer, manager, publisher, attorney, engineer, label executive,
music supervisor, and similar labels are **professional roles**, not account types and not
permissions.

## The three account classes

| Account class | Purpose | Structural signal | Product context |
|---|---|---|---|
| **Member Account** | Personal and professional creative work | `user_profiles` row | Member workspace: Ideas, Sound Vault, Writer's Room, Contract Locker, network, tools |
| **Client Partner Account** | Verified organization access for licensing music through The Crate | approved `buyer_members` relationship to `buyer_orgs` | Client Partner organization workspace |
| **Funūn Team Member Account** | Operating the Funūn business | `funun_staff` row plus server-verified `staff_roles[]` | Internal staff/admin surfaces |

Limited guests and signature recipients are **not a fourth account class**. They receive a
narrow, expiring invitation or signing context. If they later join Funūn, they become a
Member without losing the evidence attached to the earlier invitation.

## One Member umbrella

Every full creative/professional user is a Member. A Member may wear any number of
professional roles and may use different roles on different works. Completing a profile is
never required before capturing an idea, entering a Writer's Room, uploading a take, writing
lyrics, or leaving a note.

The existing `member_type = 'artist' | 'industry'`, `industry_roles`, and
`capability_grants` fields remain transitional compatibility data. They must not be treated as
the canonical account taxonomy or used to hide the core Member workspace. Remove them only
after every dependent route and production record has been migrated and audited.

## Roles, relationships, and rights are separate

- **Professional role:** who a person is or what hats they wear. It may personalize copy or
  prefill a form. It grants nothing by itself.
- **Workspace relationship:** where a person may act, such as membership in a Client Partner
  organization or invitation to a Writer's Room.
- **Project authority:** what a person may do in a specific context, such as invite, approve,
  sign, download, license, or administer.
- **Rights record:** what a split sheet, contract, registration, or other evidence says about
  authorship, ownership, control, or payment.

Declaring “Music Supervisor” does not unlock The Crate. Being in a Writer's Room does not put
someone on a split sheet. Managing a project does not establish ownership or signature
authority. No actor may grant more authority than they hold.

## Member plus Client Partner

A person may simultaneously be a Member and belong to a verified Client Partner
organization under the same authenticated identity. Example: Jordan can write and produce in
a personal Member workspace while acting as a music supervisor in Netflix's Client Partner
workspace.

These contexts remain separate:

- Personal songs, collaborators, creative agreements, and rights records stay in the Member
  workspace.
- Shortlists, requests, company activity, and licensing agreements stay in the Client Partner
  organization workspace.
- The UI provides an explicit workspace switch. Data never merges merely because the same
  person can reach both contexts.
- Client Partner access is added or revoked through `buyer_members`; it must not depend on an
  exclusive `app_metadata.role = 'buyer'` check.

Current transactional code supports one Client Partner organization relationship per person.
Supporting several organizations requires an explicit active-organization selector and a
route-by-route audit; do not silently add a second membership before that phase ships.

## Corporate-email continuity

Organization access and personal identity continuity are different concerns. Before a person
relies on a corporate email as the only credential for a personal Member workspace, Funūn
must offer a verified personal login/recovery method (such as a secondary verified email or
passkey). When employment ends, the organization revokes only the Client Partner
relationship. The personal Member workspace and its records remain with the person.

This verified credential-linking flow is a dedicated authentication build. Until it exists,
the product must not claim that changing an email or typing a recovery address safely links
two identities.

## Funūn Team Member separation

Funūn Team Member identities remain privileged and structurally separate. Staff permissions
come from server-verified staff roles, are purpose-specific, and are audited. A staff identity
must not double as a Member or Client Partner identity. If a staff person also makes music,
they should use a separate personal Member login.

The account-context resolver fails closed to staff-only context if legacy data contains an
unexpected staff/member or staff/buyer overlap.

## Contract and licensing homes

- Contract Locker is available to every Member, including managers who are not writers.
- Split Sheets are a section inside Contract Locker. Existing `/split-sheets/new` and
  `/split-sheets/[id]` workflow links remain valid; the standalone list URL redirects to the
  Contract Locker section.
- Client Partner licensing documents belong with The Crate's Licenses/Agreements context,
  not in the person's Member Contract Locker.

## Provisioning and authorization rules

1. Self-serve or invited full users receive a Member profile.
2. An authorized organization administrator may attach an existing Member identity to one
   Client Partner organization; this must preserve the Member profile, subscription, vault,
   and login.
3. A genuinely new Client Partner-only recipient may continue through the legacy buyer
   provisioning path until unified onboarding replaces it.
4. Public registration must never attach an arbitrary existing email to an organization.
   Existing-identity reconciliation is service-only and follows an authorized invitation.
5. Staff remains provisioned through the staff-only path.
6. Every sensitive action is authorized server-side and through RLS where applicable. UI
   visibility is never the security boundary.

## Engineering decision rule

When adding a feature, ask in this order:

1. Which authenticated person is acting?
2. Which account context and workspace relationship are active?
3. What project-specific permission or legal authority is required?
4. Which record is authoritative for the claimed right?

Never answer any later question from a professional-role label alone.
