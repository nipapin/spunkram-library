FULL_PROJECT apply (Premiere Pro) requires native helpers next to the extension:

  bin/win/Motionflow.dll
  bin/win/MotionflowBridge.acsrf
  bin/win/MotionflowInit.prm
  bin/template          (PTX seed → Adobe/Common/Spunkram/)
  bin/colormatte        (PTX seed)
  bin/mac/cep-plugins.zip  (Mac Motionflow.bundle + bridge plugins)

Copied into dist/cep/bin via cep.config copyAssets.
Source of truth was Spunkram Beta bin\ — see docs/sdk/INVENTORY.md.
