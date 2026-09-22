"""Inferencia de facetas. Toda salida es `origin: inferred`, `status: proposed`, con confianza y justificación."""
from .rules import (Inference, infer_data_type, infer_data_type_from_values, infer_info_domain,
                    infer_sensitivity, infer_vocabulary, load_rules, load_standards)

__all__ = ["Inference", "infer_data_type", "infer_data_type_from_values", "infer_info_domain",
           "infer_sensitivity", "infer_vocabulary", "load_rules", "load_standards"]
