// Default payer profiles, seeded on first run and editable in Admin → Payers.
//
// Prior-authorization policy per call type:
//   required     - authorization must be obtained before transport
//   varies       - depends on the plan or state; ask and verify
//   not_required - do not ask
//
// Medicaid rules differ by state and managed-care plan. Administrators
// should adjust the Medicaid profile (or add one per state / MCO).
//
// requires_medical_necessity: false skips every question marked as a
// medical-necessity question (private pay, facility pay).
// Transport brokers are payer profiles with kind 'broker'; they are added
// by administrators and may name the payer program they book for (parent_code).

export const PRIOR_AUTH_POLICIES = {
  required: 'Required',
  varies: 'Varies — verify with payer',
  not_required: 'Not required',
};

export const SEED_PAYERS = [
  {
    code: 'medicare',
    name: 'Original Medicare (Part B)',
    description: 'Fee-for-service Medicare. Coverage criteria: 42 CFR 410.40 and Medicare Benefit Policy Manual, Ch. 10.',
    prior_auth: { emergency: 'not_required', non_emergency: 'not_required', repetitive: 'varies' },
    prior_auth_note: 'Repetitive, scheduled non-emergent transports may be subject to CMS prior authorization depending on your Medicare Administrative Contractor (MAC). Check your MAC.',
    certification: 'Physician Certification Statement (PCS). Repetitive scheduled transports: signed and dated no earlier than 60 days before the transport. Non-repetitive transports: may be obtained up to 48 hours after the transport.',
    documentation: [
      'Bed-confinement alone is not sufficient — document the specific condition that makes other transport unsafe.',
      'If the patient requests a non-emergency transport that is expected to be denied, issue an Advance Beneficiary Notice of Noncoverage (ABN) before transport.',
    ],
    alternate_transport: 'Original Medicare does not cover wheelchair-van or other non-ambulance transport. Check for Medicaid or other secondary coverage.',
    contact_name: 'Medicare Administrative Contractor (MAC)',
    contact_phone: '',
    contact_url: '',
  },
  {
    code: 'medicare_advantage',
    name: 'Medicare Advantage (Part C)',
    description: 'Private Medicare plans. Plans must cover ambulance services that Original Medicare covers and follow its coverage criteria (42 CFR 422.101), but may require prior authorization for non-emergency transport.',
    prior_auth: { emergency: 'not_required', non_emergency: 'varies', repetitive: 'varies' },
    prior_auth_note: 'Medicare Advantage plans may not require prior authorization for emergency services (42 CFR 422.113). Most plans require it for scheduled non-emergency transport — check the plan.',
    certification: 'Plan-specific. Document medical necessity as for Original Medicare; most plans also require or accept a PCS.',
    documentation: [
      'Verify eligibility and the plan name using the member ID card or the plan portal.',
      'Record the plan\'s authorization or reference number on the trip.',
      'Out-of-network non-emergency transport may not be covered unless the plan authorizes it.',
    ],
    alternate_transport: 'Many Medicare Advantage plans offer a supplemental transportation benefit (e.g., wheelchair van or rideshare). Refer the caller to the plan\'s member services.',
    contact_name: 'Plan utilization management (number on member ID card)',
    contact_phone: '',
    contact_url: '',
  },
  {
    code: 'medicaid',
    name: 'Medicaid',
    description: 'State Medicaid program (fee-for-service or managed care). Coverage, forms and authorization rules are set by each state — review this profile against your state\'s provider manual.',
    prior_auth: { emergency: 'not_required', non_emergency: 'varies', repetitive: 'varies' },
    prior_auth_note: 'Most states require prior authorization for non-emergency ambulance transport. Managed-care (MCO) members follow the MCO\'s authorization process.',
    certification: 'State-specific. Most states require a practitioner certification or medical-necessity form for non-emergency ambulance — use your state\'s form.',
    documentation: [
      'Verify Medicaid eligibility for the date of service.',
      'Medicaid is the payer of last resort: if the patient has Medicare or other coverage, bill that payer first.',
    ],
    alternate_transport: 'Medicaid must ensure necessary transportation to covered services (42 CFR 431.53). If ambulance is not indicated, refer the caller to the state\'s non-emergency medical transportation (NEMT) broker for wheelchair or ambulatory transport.',
    contact_name: 'State Medicaid / NEMT broker',
    contact_phone: '',
    contact_url: '',
  },
  {
    code: 'commercial',
    name: 'Commercial insurance',
    description: 'Employer or individual health plans. Coverage criteria and authorization rules are set by each plan\'s medical policy.',
    prior_auth: { emergency: 'not_required', non_emergency: 'varies', repetitive: 'varies' },
    prior_auth_note: 'Check the plan\'s medical policy for non-emergency ambulance authorization requirements.',
    certification: 'Plan-specific — check the plan\'s medical policy.',
    documentation: [
      'Verify eligibility, benefits, and network status.',
      'Federal No Surprises Act balance-billing protections do not apply to ground ambulance; some states have their own protections.',
    ],
    alternate_transport: 'Check whether the plan covers wheelchair-van or other non-emergency transportation.',
    contact_name: 'Plan provider services (number on member ID card)',
    contact_phone: '',
    contact_url: '',
  },
  {
    code: 'private_pay',
    name: 'Private pay (self-pay)',
    description: 'The patient or a family member pays directly. No medical-necessity review is required.',
    requires_medical_necessity: false,
    prior_auth: { emergency: 'not_required', non_emergency: 'not_required', repetitive: 'not_required' },
    prior_auth_note: '',
    certification: '',
    documentation: [
      'Quote the transport rate and confirm the payment method before scheduling.',
      'Have the patient or responsible party sign the financial responsibility agreement.',
    ],
    alternate_transport: '',
    contact_name: '',
    contact_phone: '',
    contact_url: '',
  },
  {
    code: 'facility_pay',
    name: 'Facility pay',
    description: 'The sending or receiving facility (hospital, SNF, hospice) pays under its agreement with us. No medical-necessity review is required.',
    requires_medical_necessity: false,
    prior_auth: { emergency: 'not_required', non_emergency: 'not_required', repetitive: 'not_required' },
    prior_auth_note: '',
    certification: '',
    documentation: [
      'Confirm the facility has an active billing agreement with us.',
      'Record who at the facility authorized the transport and any purchase-order number.',
    ],
    alternate_transport: '',
    contact_name: '',
    contact_phone: '',
    contact_url: '',
  },
];
