# --- SEQUENCE_BUILDER_METADATA_START ---
# {
#   "schemaVersion": 1,
#   "format": "ARTIQ Sequence Builder",
#   "exportedAt": "2026-09-01T12:13:19.834Z",
#   "experiment": {
#     "fileName": "e05_mixed_dds_and_ttl.py",
#     "sequenceName": "E05 mixed DDS and TTL",
#     "className": "E05MixedDdsTtl",
#     "repetitionCount": 1,
#     "fetchBatchSize": 100,
#     "startSlackMs": 0,
#     "startSlackUnit": "ms",
#     "interLoopDelayMs": 0,
#     "interLoopDelayUnit": "ms"
#   },
#   "editorState": {
#     "sequenceName": "E05 mixed DDS and TTL",
#     "className": "E05MixedDdsTtl",
#     "fetchBatchSize": 100,
#     "startSlackMs": 0,
#     "startSlackUnit": "ms",
#     "timelineTimeUnit": null,
#     "pixelsPerMs": 70,
#     "snapGridMs": 0.1,
#     "loop": {
#       "count": 1,
#       "interLoopDelayMs": 0,
#       "interLoopDelayUnit": "ms"
#     },
#     "availableChannels": [
#       {
#         "id": "ttl0",
#         "label": "ttl0",
#         "type": "ttl_output"
#       },
#       {
#         "id": "ttl1",
#         "label": "ttl1",
#         "type": "ttl_output"
#       },
#       {
#         "id": "urukul0_ch0",
#         "label": "urukul0_ch0",
#         "type": "dds"
#       },
#       {
#         "id": "urukul0_ch1",
#         "label": "urukul0_ch1",
#         "type": "dds"
#       }
#     ],
#     "visibleChannelIds": [
#       "ttl0",
#       "ttl1",
#       "urukul0_ch0",
#       "urukul0_ch1"
#     ],
#     "modules": [
#       {
#         "id": "cooling-dds",
#         "type": "dds",
#         "name": "Cooling DDS",
#         "channel": "urukul0_ch0",
#         "startMs": 0,
#         "durationMs": 3,
#         "endMs": 3,
#         "gapAfterPrevious": 0,
#         "locked": false,
#         "timeUnit": "ms",
#         "frequencyMHz": 80,
#         "amplitude": 0.5,
#         "attenuationDb": 10,
#         "phaseDeg": 0,
#         "phaseMode": "absolute",
#         "ddsParameters": {
#           "frequency": {
#             "value": 80,
#             "unit": "MHz",
#             "sweep": {
#               "enabled": false,
#               "start": 80,
#               "end": 80,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           },
#           "amplitude": {
#             "value": 0.5,
#             "unit": "",
#             "sweep": {
#               "enabled": false,
#               "start": 0.5,
#               "end": 0.5,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           },
#           "phase": {
#             "value": 0,
#             "unit": "deg",
#             "sweep": {
#               "enabled": false,
#               "start": 0,
#               "end": 0,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           },
#           "duration": {
#             "value": 3,
#             "unit": "ms",
#             "sweep": {
#               "enabled": false,
#               "start": 3,
#               "end": 3,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           }
#         }
#       },
#       {
#         "id": "camera-trigger",
#         "type": "ttl_output",
#         "name": "Camera trigger",
#         "channel": "ttl0",
#         "startMs": 1,
#         "durationMs": 0.2,
#         "endMs": 1.2,
#         "gapAfterPrevious": 1,
#         "locked": false,
#         "timeUnit": "ms"
#       },
#       {
#         "id": "repump-dds",
#         "type": "dds",
#         "name": "Repump DDS",
#         "channel": "urukul0_ch1",
#         "startMs": 3.5,
#         "durationMs": 1,
#         "endMs": 4.5,
#         "gapAfterPrevious": 3.5,
#         "locked": false,
#         "timeUnit": "ms",
#         "frequencyMHz": 120,
#         "amplitude": 0.3,
#         "attenuationDb": 10,
#         "phaseDeg": 0,
#         "phaseMode": "absolute",
#         "ddsParameters": {
#           "frequency": {
#             "value": 120,
#             "unit": "MHz",
#             "sweep": {
#               "enabled": false,
#               "start": 120,
#               "end": 120,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           },
#           "amplitude": {
#             "value": 0.3,
#             "unit": "",
#             "sweep": {
#               "enabled": false,
#               "start": 0.3,
#               "end": 0.3,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           },
#           "phase": {
#             "value": 0,
#             "unit": "deg",
#             "sweep": {
#               "enabled": false,
#               "start": 0,
#               "end": 0,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           },
#           "duration": {
#             "value": 1,
#             "unit": "ms",
#             "sweep": {
#               "enabled": false,
#               "start": 1,
#               "end": 1,
#               "step": 0,
#               "points": 1,
#               "invalid": false,
#               "error": "",
#               "lastEditedFields": []
#             }
#           }
#         }
#       }
#     ]
#   },
#   "plots": []
# }
# --- SEQUENCE_BUILDER_METADATA_END ---

from artiq.experiment import *
from artiq.coredevice.ad9910 import PHASE_MODE_ABSOLUTE, PHASE_MODE_CONTINUOUS, PHASE_MODE_TRACKING


class E05MixedDdsTtl(EnvExperiment):
    def build(self):
        self.setattr_device("core")
        self.setattr_device("urukul0_cpld")
        self.setattr_device("urukul0_ch0")
        self.setattr_device("urukul0_ch1")
        self.setattr_device("ttl0")

    def prepare(self):

    # Print a compact host-side summary for quick inspection in the ARTIQ log.
    # This method must stay outside the kernel and must not affect RTIO timing.
    def print_run_brief(self):
        print("========== Experiment Run Brief ==========")
        print("Experiment: E05 mixed DDS and TTL")
        print("Generated by: ARTIQ Sequence Builder")
        print("Run mode: no sweep")
        print("")
        print("Sweep:")
        print("- none")
        print("")
        print("Repetition:")
        print("- repetitions: " + str(1))
        print("- scan points: " + str(1))
        print("- total measurement shots: " + str(1 * 1 * 0))
        print("")
        print("Channels:")
        print("- DDS: urukul0_ch0, urukul0_ch1")
        print("- TTL out: ttl0")
        print("- Counters: none")
        print("")
        print("Datasets:")
        print("- no counter result datasets")
        print("")
        print("Applets:")
        print("- none")
        print("==========================================")

    @kernel
    def run_kernel(self):
        self.core.reset()
        self.core.break_realtime()
        self.urukul0_cpld.init()
        self.urukul0_ch0.init()
        self.urukul0_ch1.init()

        with parallel:
            # Channel: urukul0_ch0
            with sequential:
                self.urukul0_ch0.set_att(10.0 * dB)
                self.urukul0_ch0.set(80.0 * MHz, amplitude=0.5, phase=0.0 / 360.0, phase_mode=PHASE_MODE_ABSOLUTE)
                self.urukul0_ch0.sw.on()
                delay(3.0 * ms)
                self.urukul0_ch0.sw.off()
            # Channel: urukul0_ch1
            with sequential:
                delay(3.5 * ms)
                self.urukul0_ch1.set_att(10.0 * dB)
                self.urukul0_ch1.set(120.0 * MHz, amplitude=0.3, phase=0.0 / 360.0, phase_mode=PHASE_MODE_ABSOLUTE)
                self.urukul0_ch1.sw.on()
                delay(1.0 * ms)
                self.urukul0_ch1.sw.off()
            # Channel: ttl0
            with sequential:
                delay(1.0 * ms)
                self.ttl0.on()
                delay(0.2 * ms)
                self.ttl0.off()

        self.core.wait_until_mu(now_mu())

    def run(self):
        self.print_run_brief()
        self.run_kernel()
