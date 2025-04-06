module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  console.log('Notarizing macOS application...');

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  
  try {
    const { notarize } = await import('@electron/notarize');
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
      appBundleId: context.packager.config.appId,
      keychain: process.env.KEYCHAIN_PATH || undefined
    });
    console.log('Notarization completed successfully!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
}; 