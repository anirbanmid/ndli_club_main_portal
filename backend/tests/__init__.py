"""Named adversarial test pins for milestone M1 (BRIEF_M1.md §7).

T1 tokens · T2 OTP lifecycle · T3 access matrix · T4 IDOR scope ·
T5 audit · T6 security headers · T7 identity lifecycle.

These live apart from the per-app ``tests.py`` smoke tests so the pins stay
greppable and a *missing* pin is obvious. Run with ``pytest`` from
``backend/`` (``testpaths`` includes this package).
"""
