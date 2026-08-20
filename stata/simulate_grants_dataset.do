/*============================================================
  PHILANTHROPY EFFECTIVENESS EVALUATION TOOL
  Simulated Grants Dataset — Based on Candid
  Open 990 Data Structure 

  KEY VARIABLES TO SIMULATE:
  ─────────────────────────────────────────────────────────────
  - grant_id          : unique identifier
  - foundation        : funder name
  - recipient_org     : grantee name
  - grant_year        : 2015–2024
  - grant_amount      : USD
  - grant_type        : general operating vs. project-specific
  - duration_years    : 1, 2, 3+ year grants
  - sector_ntee       : NTEE major group (A–Z, C=environment, etc.)
  - strategy          : e.g., advocacy, capacity-building, direct service
  - state             : US state
  - region            : Census region
  - urban_rural       : urban/suburban/rural
  - recipient_budget  : grantee org annual budget
  - bipoc_led         : 0/1 — whether org is BIPOC-led
  - unrestricted      : 0/1 — general operating support
  - multi_year        : 0/1
  - collab_grant      : 0/1 — co-funded with another funder
  - outcome_measure   : 0/1 — grantee reported measurable outcome
  - impact_score      : 1–5 composite (constructed)
  
  CONTROLS (based on philanthropy effectiveness literature):
  ─────────────────────────────────────────────────────────────
  - log_grant_amount  : log transformation (right-skewed)
  - log_org_budget    : org size control
  - grant_age         : years since first grant (relationship depth)
  - num_grants_total  : grantee concentration measure
  - hhi_sector        : Herfindahl-Hirschman Index of sector allocation
  - place_based       : 0/1 — place-based strategy

============================================================*/

clear all
set seed 42
set obs 1200   /* 600 grants per foundation */

*------------------------------------------------------------
* 1. FOUNDATION IDENTITY
*------------------------------------------------------------
gen foundation = ""
replace foundation = "Tides Foundation"     if _n <= 600
replace foundation = "Kresge Foundation"    if _n > 600

gen foundation_id = 1 if foundation == "Tides Foundation"
replace foundation_id = 2 if foundation == "Kresge Foundation"

*------------------------------------------------------------
* 2. TEMPORAL DIMENSION (2015–2024)
*------------------------------------------------------------
gen grant_year = 2015 + int((_n - 1) / 120)   /* 120 grants/yr/foundation */
/* Adjust: Tides 2015–2024, Kresge 2015–2024 */
replace grant_year = 2015 + mod(_n - 1, 10) if foundation_id == 1
replace grant_year = 2015 + mod(_n - 601, 10) if foundation_id == 2

*------------------------------------------------------------
* 3. SECTOR ALLOCATION (NTEE-based)
*------------------------------------------------------------
/* Tides: skewed toward C (environment), R (civil rights), Q (intl) */
/* Kresge: skewed toward L (housing), C (environment), E (health)  */
gen sector_code = ""

/* Tides sector distribution */
gen u1 = runiform() if foundation_id == 1
replace sector_code = "C - Environment"       if foundation_id==1 & u1 < .35
replace sector_code = "R - Civil Rights"       if foundation_id==1 & u1 >= .35 & u1 < .60
replace sector_code = "Q - International"      if foundation_id==1 & u1 >= .60 & u1 < .72
replace sector_code = "K - Food/Nutrition"     if foundation_id==1 & u1 >= .72 & u1 < .82
replace sector_code = "P - Human Services"     if foundation_id==1 & u1 >= .82 & u1 < .91
replace sector_code = "W - Public/Society"     if foundation_id==1 & u1 >= .91

/* Kresge sector distribution */
gen u2 = runiform() if foundation_id == 2
replace sector_code = "L - Housing"            if foundation_id==2 & u2 < .30
replace sector_code = "C - Environment"        if foundation_id==2 & u2 >= .30 & u2 < .52
replace sector_code = "E - Health"             if foundation_id==2 & u2 >= .52 & u2 < .68
replace sector_code = "S - Community Dev"      if foundation_id==2 & u2 >= .68 & u2 < .80
replace sector_code = "B - Education"          if foundation_id==2 & u2 >= .80 & u2 < .90
replace sector_code = "T - Philanthropy"       if foundation_id==2 & u2 >= .90
drop u1 u2

*------------------------------------------------------------
* 4. GEOGRAPHIC FOCUS
*------------------------------------------------------------
/* Census regions — Tides: national/west coast; Kresge: rust belt/midwest */
gen region = ""
gen u3 = runiform()
replace region = "West"      if foundation_id==1 & u3 < .30
replace region = "South"     if foundation_id==1 & u3 >= .30 & u3 < .52
replace region = "Northeast" if foundation_id==1 & u3 >= .52 & u3 < .70
replace region = "Midwest"   if foundation_id==1 & u3 >= .70 & u3 < .85
replace region = "National"  if foundation_id==1 & u3 >= .85

replace region = "Midwest"   if foundation_id==2 & u3 < .38
replace region = "South"     if foundation_id==2 & u3 >= .38 & u3 < .56
replace region = "Northeast" if foundation_id==2 & u3 >= .56 & u3 < .72
replace region = "West"      if foundation_id==2 & u3 >= .72 & u3 < .88
replace region = "National"  if foundation_id==2 & u3 >= .88
drop u3

/* Urban/rural classification */
gen u4 = runiform()
gen urban_rural = "Urban"    if u4 < .60
replace urban_rural = "Suburban" if u4 >= .60 & u4 < .82
replace urban_rural = "Rural"    if u4 >= .82
drop u4

*------------------------------------------------------------
* 5. GRANT SIZE (log-normal distribution — realistic)
*------------------------------------------------------------
/* Tides: median ~$150k, Kresge: median ~$350k */
gen ln_amount = .
replace ln_amount = rnormal(11.9, 1.1) if foundation_id == 1  /* ln(150k) ≈ 11.9 */
replace ln_amount = rnormal(12.8, 0.9) if foundation_id == 2  /* ln(360k) ≈ 12.8 */
gen grant_amount = round(exp(ln_amount), 1000)
/* Floor at $10k, cap at $5M */
replace grant_amount = 10000   if grant_amount < 10000
replace grant_amount = 5000000 if grant_amount > 5000000

*------------------------------------------------------------
* 6. GRANT CHARACTERISTICS
*------------------------------------------------------------
gen u5 = runiform()
gen grant_type = "General Operating" if u5 < .55 & foundation_id == 1
replace grant_type = "Project-Specific" if u5 >= .55 & foundation_id == 1
replace grant_type = "General Operating" if u5 < .40 & foundation_id == 2
replace grant_type = "Project-Specific" if u5 >= .40 & u5 < .75 & foundation_id == 2
replace grant_type = "Capacity-Building" if u5 >= .75 & foundation_id == 2
drop u5

gen u6 = runiform()
gen duration_years = 1 if u6 < .30
replace duration_years = 2 if u6 >= .30 & u6 < .60
replace duration_years = 3 if u6 >= .60 & u6 < .82
replace duration_years = 4 if u6 >= .82
drop u6

/* Multi-year flag */
gen multi_year = (duration_years >= 2)

/* BIPOC-led organization */
gen u7 = runiform()
gen bipoc_led = (u7 < .68) if foundation_id == 1   /* Tides: explicitly BIPOC-centered */
replace bipoc_led = (u7 < .55) if foundation_id == 2
drop u7

/* Collaborative/co-funded grant */
gen u8 = runiform()
gen collab_grant = (u8 < .22) if foundation_id == 1
replace collab_grant = (u8 < .35) if foundation_id == 2  /* Kresge: more SIP co-investments */
drop u8

*------------------------------------------------------------
* 7. RECIPIENT ORGANIZATION SIZE
*------------------------------------------------------------
gen ln_org_budget = rnormal(13.5, 1.3)   /* median ~$730k */
gen org_budget = round(exp(ln_org_budget), 5000)
replace org_budget = 50000     if org_budget < 50000
replace org_budget = 50000000  if org_budget > 50000000

/* Grant-to-budget ratio (leverage) */
gen grant_leverage = grant_amount / org_budget

*------------------------------------------------------------
* 8. IMPACT MEASUREMENT (composite score 1–5)
*------------------------------------------------------------
/* Based on: OECD DAC + Twersky (2013) listening to grantees */
/* Higher score = stronger evidence of impact                 */
gen impact_score = 1
replace impact_score = impact_score + 0.8  if multi_year == 1
replace impact_score = impact_score + 0.7  if grant_type == "General Operating"
replace impact_score = impact_score + 0.5  if bipoc_led == 1
replace impact_score = impact_score + 0.4  if collab_grant == 1
replace impact_score = impact_score + 0.3  if duration_years >= 3
replace impact_score = impact_score + rnormal(0, 0.4)   /* measurement noise */
replace impact_score = min(max(impact_score, 1), 5)
gen impact_score_rounded = round(impact_score, 0.5)

/* Outcome reported (0/1) */
gen u9 = runiform()
gen outcome_reported = (u9 < 0.42 + 0.12*multi_year + 0.08*(grant_type=="General Operating"))
drop u9

*------------------------------------------------------------
* 9. CONCENTRATION METRICS
*------------------------------------------------------------
/* HHI by sector within foundation (computed after simulation) */
bysort foundation sector_code: gen grants_in_sector = _N
bysort foundation: gen total_grants = _N
gen sector_share = grants_in_sector / total_grants
/* HHI = sum of squared shares — compute at foundation level */
gen sector_share_sq = sector_share^2
bysort foundation: egen hhi_sector = sum(sector_share_sq)
/* Normalize to 0–1 (0=perfectly diverse, 1=monopoly) */
/* Kresge expected ~0.18, Tides ~0.22 given distributions above */

*------------------------------------------------------------
* 10. LOG TRANSFORMS FOR REGRESSION
*------------------------------------------------------------
gen log_grant_amount = log(grant_amount)
gen log_org_budget   = log(org_budget)
gen log_leverage     = log(grant_leverage + 0.001)

*------------------------------------------------------------
* 11. SAMPLE REGRESSIONS (OLS + Logit)
*------------------------------------------------------------

/* OLS: What predicts grant size? */
reg log_grant_amount i.foundation_id i.multi_year bipoc_led ///
    collab_grant log_org_budget i.duration_years, robust

/* Logit: What predicts outcome being reported? */
logit outcome_reported i.foundation_id multi_year bipoc_led ///
    collab_grant log_grant_amount log_org_budget, robust

/* Margins: predicted probability of outcome reporting */
margins foundation_id, atmeans

/* OLS: Impact score regression */
reg impact_score i.foundation_id multi_year bipoc_led collab_grant ///
    log_grant_amount log_org_budget i.grant_year, robust

*------------------------------------------------------------
* 12. SUMMARY STATISTICS TABLE
*------------------------------------------------------------
tabstat grant_amount org_budget duration_years impact_score ///
        multi_year bipoc_led collab_grant outcome_reported, ///
        by(foundation) stats(mean sd median p25 p75 n) format(%10.2f)

/* Sector allocation by foundation */
tab sector_code foundation, row

/* Geographic distribution */
tab region foundation, row

*------------------------------------------------------------
* 13. EXPORT FOR DASHBOARD
*------------------------------------------------------------
export delimited using "philanthropy_grants_simulated.csv", replace
save "philanthropy_grants_simulated.dta", replace

display "Dataset created: 1,200 grants across Tides & Kresge (2015–2024)"
display "Ready for import into Python/R or dashboard visualization"

/*============================================================
  FRAMEWORK NOTE — Impact Evaluation Logic:
  
  The impact_score composite approximates a "theory of change"
  fidelity index — how closely grant structure aligns with
  evidence-based effective giving practices.
============================================================*/
