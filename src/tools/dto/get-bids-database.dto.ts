export class GetBidsDatabaseDto {
    readonly owner: string
    readonly database: string
    readonly BIDS_definitions: string[]
}


export class BidsDatabaseSchemaDto {
    "BIDS_definitions": {
        "Anat": {
            "keylist": [
                "sub",
                "ses",
                "acq",
                "ce",
                "rec",
                "run",
                "mod",
                "modality",
                "fileLoc",
                "AnatJSON"
            ],
            "required_keys": [
                "sub",
                "fileLoc",
                "modality"
            ],
            "allowed_modalities": [
                "T1w",
                "T2w",
                "T1rho",
                "T1map",
                "T2map",
                "T2star",
                "FLAIR",
                "PD",
                "Pdmap",
                "PDT2",
                "inplaneT1",
                "inplaneT2",
                "angio",
                "defacemask",
                "CT"
            ],
            "allowed_file_formats": [
                ".nii"
            ],
            "readable_file_formats": [
                ".nii",
                ".dcm"
            ],
            "required_protocol_keys": []
        },
        "AnatJSON": {
            "keylist": [
                "Manufacturer",
                "ManufacturersModelName",
                "DeviceSerialNumber",
                "StationName",
                "SoftwareVersions",
                "HardcopyDeviceSoftwareVersion",
                "MagneticFieldStrength",
                "ReceiveCoilName",
                "ReceiveCoilActiveElements",
                "GradientSetType",
                "MRTransmitCoilSequence",
                "MatrixCoilMode",
                "CoilCombinationMethod",
                "PulseSequenceType",
                "ScanningSequence",
                "SequenceVariant",
                "ScanOptions",
                "SequenceName",
                "PulseSequenceDetails",
                "NonlinearGradientCorrection",
                "NumberShots",
                "ParallelReductionFactorInPlane",
                "ParallelAcquisitionTechnique",
                "PartialFourier",
                "PartialFourierDirection",
                "RepetitionTime",
                "PhaseEncodingDirection",
                "EffectiveEchoSpacing",
                "TotalReadoutTime",
                "EchoTime",
                "EchoTrainLength",
                "InversionTime",
                "SliceTiming",
                "SliceEncodingDirection",
                "SliceThickness",
                "DwellTime",
                "FlipAngle",
                "MultibandAccelerationFactor",
                "NegativeContrast",
                "AnatomicalLandmarkCoordinates",
                "InstitutionName",
                "InstitutionAddress",
                "InstitutionalDepartmentName",
                "ContrastBolusIngredient"
            ]
        },
        "Ieeg": {
            "keylist": [
                "sub",
                "ses",
                "task",
                "acq",
                "run",
                "proc",
                "modality",
                "fileLoc",
                "IeegJSON",
                "IeegChannelsTSV",
                "IeegEventsTSV"
            ],
            "required_keys": [
                "sub",
                "fileLoc",
                "task",
                "modality"
            ],
            "allowed_modalities": [
                "ieeg"
            ],
            "allowed_file_formats": [
                ".edf",
                ".vhdr",
                ".set"
            ],
            "readable_file_formats": [
                ".edf",
                ".vhdr",
                ".set",
                ".trc",
                ".eeg",
                ".mff",
                ".ades"
            ],
            "channel_type": [
                "ECOG",
                "SEEG",
                "DBS",
                "PD",
                "ADC",
                "DAC",
                "REF",
                "OTHER",
                "EEG",
                "VEOG",
                "HEOG",
                "EOG",
                "ECG",
                "EMG",
                "TRIG",
                "AUDIO",
                "EYEGAZE",
                "PUPIL",
                "MISC",
                "SYSCLOCK"
            ],
            "mod_channel_type": [
                "ECOG",
                "SEEG"
            ],
            "required_protocol_keys": []
        },
        "IeegJSON": {
            "keylist": [
                "TaskName",
                "Manufacturer",
                "ManufacturersModelName",
                "TaskDescription",
                "Instructions",
                "CogAtlasID",
                "CogPOID",
                "InstitutionName",
                "InstitutionAddress",
                "DeviceSerialNumber",
                "PowerLineFrequency",
                "ECOGChannelCount",
                "SEEGChannelCount",
                "EEGChannelCount",
                "EOGChannelCount",
                "ECGChannelCount",
                "EMGChannelCount",
                "MiscChannelCount",
                "TriggerChannelCount",
                "RecordingDate",
                "RecordingDuration",
                "RecordingType",
                "EpochLength",
                "DeviceSoftwareVersion",
                "SubjectArtefactDescription",
                "iEEGPlacementScheme",
                "iEEGReferenceScheme",
                "ElectricalStimulation",
                "ElectricalStimulationParameters",
                "Medication",
                "iEEGReference",
                "SamplingFrequency",
                "SoftwareFilters"
            ],
            "required_keys": [
                "TaskName",
                "PowerLineFrequency",
                "SoftwareFilters",
                "iEEGReference",
                "SamplingFrequency"
            ]
        },
        "DatasetDescJSON": {
            "keylist": [
                "Name",
                "BIDSVersion",
                "License",
                "Authors",
                "Acknowledgements",
                "HowToAcknowledge",
                "Funding",
                "ReferencesAndLinks",
                "DatasetDOI"
            ],
            "required_keys": [
                "Name",
                "BIDSVersion"
            ],
            "filename": "dataset_description.json",
            "bids_version": "1.4.1"
        }
    }

}
