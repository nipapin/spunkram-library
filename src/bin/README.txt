FULL_PROJECT apply (Premiere Pro) requires native helpers next to the extension:

  bin/win/Motionflow.dll
  bin/win/MotionflowBridge.acsrf
  bin/win/MotionflowInit.prm
  bin/template          (PTX seed → Adobe/Common/Spunkram/)
  bin/colormatte        (PTX seed)
  bin/mac/cep-plugins.zip  (Mac Motionflow.bundle + bridge plugins)

Copied into dist/cep/bin via cep.config copyAssets.
Source of truth was Spunkram Beta bin\ — see docs/sdk/INVENTORY.md.

macOS: the panel's Install Bridge button extracts cep-plugins.zip into a
versioned native/mac directory under this brand's Application Support folder,
then installs MotionflowBridge and MotionflowInit into Adobe Common Plug-ins.
The bundled MotionflowInit looks for Bridge in Plug-ins/ControlSurface (legacy
spelling); preserve that location for new Bridge installs. Existing Plugins
or Plug-ins installations are retained. Restart Premiere after installation.
If the bridge is not added automatically, Preferences > Control Surface > Add
lets the user select Motionflow Bridge. The ExternalObject library is loaded
from the extracted Motionflow.bundle parent, not from the CEP extension root.
