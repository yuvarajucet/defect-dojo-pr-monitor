from enum import Enum
from typing import List, Dict, Any
from urllib.parse import unquote_plus

class FilterValues(Enum):
    """Enumeration of filter options used by PR monitor views and queries.

    Members map human-readable labels to stable enum names so inputs can be
    matched by either enum name (e.g., "ME") or display value (e.g., "Me").
    """
    ME = "Me"
    NEW_ISSUE = "New issue"
    NOT_AN_ISSUE = "Not an issue"
    BREAKING_ISSUE = "Breaking issue"

def get_filter_values() -> List[Dict[str, Any]]:
    """Return filter options as a list of dicts suitable for UI consumption.

    Each dict contains:
    - key: enum name (stable identifier)
    - value: enum value (display value)
    - label: same as value for convenience in dropdowns
    """
    return [
        {"key": fv.name, "value": fv.value, "label": fv.value}
        for fv in FilterValues
    ]

def parse_filter_values(raw: str) -> List[FilterValues]:
    """Parse a comma-separated filter string into a list of FilterValues.

    Behavior:
    - Accepts either enum names (e.g., "ME") or display values (e.g., "Me").
    - Case-insensitive matching and URL-decoding are applied.
    - Ignores empty items and removes duplicates while preserving order.
    - Returns an empty list if input is falsy.
    """
    if not raw:
        return []

    values: List[FilterValues] = []
    decoded = unquote_plus(raw)
    items = [x.strip() for x in decoded.split(',') if x and x.strip()]
    for item in items:
        lowered = item.lower()
        for fv in FilterValues:
            if fv.name.lower() == lowered or fv.value.lower() == lowered:
                if fv not in values:
                    values.append(fv)
                break
    return values


def filtervalues_to_validation_status(values: List[FilterValues]) -> List[str]:
    """Map selected FilterValues to corresponding validation status strings.

    Only filters with a validation status mapping are returned. Unknown or
    unmapped filters are ignored.
    """
    mapping = {
        FilterValues.NEW_ISSUE: "New issue",
        FilterValues.NOT_AN_ISSUE: "Not an issue",
        FilterValues.BREAKING_ISSUE: "Breaking issue",
    }
    result: List[str] = []
    for fv in values:
        if fv in mapping:
            result.append(mapping[fv])
    return result
