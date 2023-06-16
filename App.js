import { PropTypes } from 'prop-types';
import React, { PureComponent } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Scanner, { RectangleOverlay } from 'react-native-rectangle-scanner';

export default class DocumentScanner extends PureComponent {
  static propTypes = {
    cameraIsOn: PropTypes.bool,
    onLayout: PropTypes.func,
    onPictureTaken: PropTypes.func,
    onPictureProcessed: PropTypes.func,
  };

  static defaultProps = {
    cameraIsOn: undefined, // Whether camera is on or off
    onLayout: () => { }, // Invokes when the camera layout is initialized
    onPictureTaken: () => { }, // Invokes when the picture is taken
    onPictureProcessed: () => { }, // Invokes when the picture is taken and cached.
  };

  constructor(props) {
    super(props);
    this.state = {
      flashEnabled: false,
      showScannerView: false,
      didLoadInitialLayout: false,
      detectedRectangle: false,
      isMultiTasking: false,
      loadingCamera: true,
      processingImage: false,
      takingPicture: false,
      overlayFlashOpacity: new Animated.Value(0),
      device: {
        initialized: false,
        hasCamera: false,
        permissionToUseCamera: false,
        flashIsAvailable: false,
        previewHeightPercent: 1,
        previewWidthPercent: 1,
      },
    };

    this.camera = React.createRef();
    this.imageProcessorTimeout = null;
  }

  componentDidMount() {
    if (this.state.didLoadInitialLayout && !this.state.isMultiTasking) {
      this.turnOnCamera();
    }
  }

  componentDidUpdate() {
    if (this.state.didLoadInitialLayout) {
      if (this.state.isMultiTasking) {
        return this.turnOffCamera(true);
      }
      if (this.state.device.initialized) {
        if (!this.state.device.hasCamera) {
          return this.turnOffCamera();
        }
        if (!this.state.device.permissionToUseCamera) {
          return this.turnOffCamera();
        }
      }
      if (this.props.cameraIsOn === true && !this.state.showScannerView) {
        return this.turnOnCamera();
      }
      if (this.props.cameraIsOn === false && this.state.showScannerView) {
        return this.turnOffCamera(true);
      }
      if (this.props.cameraIsOn === undefined) {
        return this.turnOnCamera();
      }
    }
    return null;
  }

  componentWillUnmount() {
    clearTimeout(this.imageProcessorTimeout);
  }

  // Called after the device gets setup. This lets you know some platform specifics
  // like if the device has a camera or flash, or even if you have permission to use the
  // camera. It also includes the aspect ratio correction of the preview
  onDeviceSetup = deviceDetails => {
    const {
      hasCamera,
      permissionToUseCamera,
      flashIsAvailable,
      previewHeightPercent,
      previewWidthPercent,
    } = deviceDetails;
    this.setState({
      loadingCamera: false,
      device: {
        initialized: true,
        hasCamera,
        permissionToUseCamera,
        flashIsAvailable,
        previewHeightPercent: previewHeightPercent || 1,
        previewWidthPercent: previewWidthPercent || 1,
      },
    });
  };

  // Set the camera view filter
  onFilterIdChange = id => {
    this.setState({ filterId: id });
    this.props.onFilterIdChange(id);
  };

  // Determine why the camera is disabled.
  getCameraDisabledMessage() {
    if (this.state.isMultiTasking) {
      return 'Camera is not allowed in multi tasking mode.';
    }

    const { device } = this.state;
    if (device.initialized) {
      if (!device.hasCamera) {
        return 'Could not find a camera on the device.';
      }
      if (!device.permissionToUseCamera) {
        return 'Permission to use camera has not been granted.';
      }
    }
    return 'Failed to set up the camera.';
  }

  // On some android devices, the aspect ratio of the preview is different than
  // the screen size. This leads to distorted camera previews. This allows for correcting that.
  getPreviewSize() {
    const dimensions = Dimensions.get('window');
    // We use set margin amounts because for some reasons the percentage values don't align the camera preview in the center correctly.
    const heightMargin =
      ((1 - this.state.device.previewHeightPercent) * dimensions.height) / 2;
    const widthMargin =
      ((1 - this.state.device.previewWidthPercent) * dimensions.width) / 2;
    if (dimensions.height > dimensions.width) {
      // Portrait
      return {
        height: this.state.device.previewHeightPercent,
        width: this.state.device.previewWidthPercent,
        marginTop: heightMargin,
        marginLeft: widthMargin,
      };
    }
    // Landscape
    return {
      width: this.state.device.previewHeightPercent,
      height: this.state.device.previewWidthPercent,
      marginTop: widthMargin,
      marginLeft: heightMargin,
    };
  }
  // Capture the current frame/rectangle. Triggers the flash animation and shows a
  // loading/processing state. Will not take another picture if already taking a picture.
  capture = () => {
    if (this.state.takingPicture) {
      return;
    }
    if (this.state.processingImage) {
      return;
    }
    this.setState({ takingPicture: true, processingImage: true });
    this.camera.current.capture();
    this.triggerSnapAnimation();

    // If capture failed, allow for additional captures
    this.imageProcessorTimeout = setTimeout(() => {
      if (this.state.takingPicture) {
        this.setState({ takingPicture: false });
      }
    }, 200);
  };

  // The picture was captured but still needs to be processed.
  onPictureTaken = event => {
    this.setState({ takingPicture: false });
    this.props.onPictureTaken(event);
  };

  // The picture was taken and cached. You can now go on to using it.
  onPictureProcessed = event => {
    this.props.onPictureProcessed(event);
    this.setState({
      image: event,
      takingPicture: false,
      processingImage: false,
      showScannerView: this.props.cameraIsOn || false,
    });
  };

  // Flashes the screen on capture
  triggerSnapAnimation() {
    Animated.sequence([
      Animated.timing(this.state.overlayFlashOpacity, {
        toValue: 0.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(this.state.overlayFlashOpacity, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(this.state.overlayFlashOpacity, {
        toValue: 0.6,
        delay: 100,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(this.state.overlayFlashOpacity, {
        toValue: 0,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }

  // Hides the camera view. If the camera view was shown and onDeviceSetup was called,
  // but no camera was found, it will not uninitialize the camera state.
  turnOffCamera(shouldUninitializeCamera = false) {
    if (shouldUninitializeCamera && this.state.device.initialized) {
      this.setState(({ device }) => ({
        showScannerView: false,
        device: { ...device, initialized: false },
      }));
    } else if (this.state.showScannerView) {
      this.setState({ showScannerView: false });
    }
  }

  // Will show the camera view which will setup the camera and start it.
  // Expect the onDeviceSetup callback to be called
  turnOnCamera() {
    if (!this.state.showScannerView) {
      this.setState({
        showScannerView: true,
        loadingCamera: true,
      });
    }
  }

  // Renders the camera controls. This will show controls on the side for large tablet screens
  // or on the bottom for phones. (For small tablets it will adjust the view a little bit).

  // Renders the camera controls or a loading/processing state
  renderCameraOverlay() {
    let loadingState = null;
    if (this.state.loadingCamera) {
      loadingState = (
        <View style={styles.overlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="white" />
            <Text style={styles.loadingCameraMessage}>Loading Camera</Text>
          </View>
        </View>
      );
    } else if (this.state.processingImage) {
      loadingState = (
        <View style={styles.overlay}>
          <View style={styles.loadingContainer}>
            <View style={styles.processingContainer}>
              <ActivityIndicator color="#333333" size="large" />
              <Text style={{ color: '#333333', fontSize: 30, marginTop: 10 }}>
                Processing
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <>
        {loadingState}
        <SafeAreaView style={[styles.overlay]}>
          {this.renderCameraControls()}
        </SafeAreaView>
      </>
    );
  }
  // Renders either the camera view, a loading state, or an error message
  // letting the user know why camera use is not allowed

  renderCameraView() {
    if (this.state.showScannerView) {
      const previewSize = this.getPreviewSize();
      let rectangleOverlay = null;
      if (!this.state.loadingCamera && !this.state.processingImage) {
        rectangleOverlay = (
          <RectangleOverlay
            detectedRectangle={this.state.detectedRectangle}
            backgroundColor="rgba(255,181,6, 0.2)"
            borderColor="red"
            borderWidth={4}
            detectedBackgroundColor="rgba(255,181,6, 0.3)"
            detectedBorderWidth={6}
            detectionCountBeforeUIChange={1}
            detectedBorderColor="green"
            detectionCountBeforeCapture={1}
            onDetectedCapture={this.capture}
            allowDetection
          />
        );
      }
      return (
        <View
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0)',
            position: 'relative',
            marginTop: previewSize.marginTop,
            marginLeft: previewSize.marginLeft,
            height: `${previewSize.height * 100}%`,
            width: `${previewSize.width * 100}%`,
          }}>
          <Scanner
            onPictureTaken={this.onPictureTaken}
            onPictureProcessed={this.onPictureProcessed}
            enableTorch={this.state.flashEnabled}
            ref={this.camera}
            capturedQuality={1}
            onRectangleDetected={({ detectedRectangle }) => {
              this.setState({ detectedRectangle });
            }}
            onDeviceSetup={this.onDeviceSetup}
            style={styles.scanner}
            onErrorProcessingImage={err => console.log('error', err)}
          />
          {rectangleOverlay}
          <Animated.View
            style={{
              ...styles.overlay,
              backgroundColor: 'white',
              opacity: this.state.overlayFlashOpacity,
            }}
          />
          {this.renderCameraOverlay()}
        </View>
      );
    }

    let message = null;
    if (this.state.loadingCamera) {
      message = (
        <View style={styles.overlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="white" />
            <Text style={styles.loadingCameraMessage}>Loading Camera</Text>
          </View>
        </View>
      );
    } else {
      message = (
        <Text style={styles.cameraNotAvailableText}>
          {this.getCameraDisabledMessage()}
        </Text>
      );
    }
    return <View style={styles.cameraNotAvailableContainer}>{message}</View>;
  }

  renderCameraControls() {
    const cameraIsDisabled =
      this.state.takingPicture || this.state.processingImage;
    const disabledStyle = { opacity: cameraIsDisabled ? 0.8 : 1 };

    return (
      <>
        <View style={styles.buttonBottomContainer}>
          <View style={styles.cameracontainer}>
            <View style={[styles.cameraOutline, disabledStyle]}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.cameraButton}
                onPress={this.capture}
              />
            </View>
          </View>
        </View>
      </>
    );
  }

  render() {
    if (this.state.image) {
      return (
        <View style={styles.previewContainer}>
          <View style={styles.previewBox}>
            <Image
              source={{ uri: this.state.image.croppedImage }}
              style={styles.preview}
            />
          </View>
          <TouchableOpacity
            style={styles.buttonContainer}
            onPress={this.retryCapture}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      return (
        <View
          style={styles.container}
          onLayout={event => {
            this.props.onLayout(event);
            if (this.state.didLoadInitialLayout && Platform.OS === 'ios') {
              const screenWidth = Dimensions.get('screen').width;
              const isMultiTasking =
                Math.round(event.nativeEvent.layout.width) <
                Math.round(screenWidth);
              if (isMultiTasking) {
                this.setState({ isMultiTasking: true, loadingCamera: false });
              } else {
                this.setState({ isMultiTasking: false });
              }
            } else {
              this.setState({ didLoadInitialLayout: true });
            }
          }}>
          <StatusBar
            backgroundColor="black"
            barStyle="light-content"
            hidden={Platform.OS !== 'android'}
          />
          {this.renderCameraView()}
        </View>
      );
    }
  }

  retryCapture = () => {
    this.setState({
      image: null,
    });
  };
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    height: 70,
    justifyContent: 'center',
    width: 65,
  },
  buttonActionGroup: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  buttonBottomContainer: {
    alignItems: 'flex-end',
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 25,
    position: 'absolute',
    right: 25,
  },
  buttonContainer: {
    alignItems: 'flex-end',
    bottom: 25,
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'absolute',
    right: 25,
    top: 25,
  },
  buttonGroup: {
    backgroundColor: '#00000080',
    borderRadius: 17,
  },
  buttonIcon: {
    color: 'white',
    fontSize: 22,
    marginBottom: 3,
    textAlign: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 13,
  },
  buttonTopContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 25,
    position: 'absolute',
    right: 25,
    top: 40,
  },
  cameraButton: {
    backgroundColor: 'white',
    borderRadius: 50,
    flex: 1,
    margin: 3,
  },
  cameraNotAvailableContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 15,
  },
  cameraNotAvailableText: {
    color: 'white',
    fontSize: 25,
    textAlign: 'center',
  },
  cameraOutline: {
    borderColor: 'white',
    borderRadius: 50,
    borderWidth: 3,
    height: 70,
    width: 70,
  },
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
  flashControl: {
    alignItems: 'center',
    borderRadius: 30,
    height: 50,
    justifyContent: 'center',
    margin: 8,
    paddingTop: 7,
    width: 50,
  },
  loadingCameraMessage: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    bottom: 0,
    flex: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  processingContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(220, 220, 220, 0.7)',
    borderRadius: 16,
    height: 140,
    justifyContent: 'center',
    width: 200,
  },
  scanner: {
    flex: 1,
  },
  preview: {
    flex: 1,
    width: null,
    height: null,
    resizeMode: 'contain',
  },
  previewBox: {
    width: 350,
    height: 350,
  },
  previewContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  buttonBottomContainer: {
    display: 'flex',
    bottom: 40,
    flexDirection: 'row',
    position: 'absolute',
  },
  buttonContainer: {
    position: 'relative',
    backgroundColor: '#000000',
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: 10,
    marginTop: 40,
    padding: 10,
    width: 100,
  },
  buttonGroup: {
    backgroundColor: '#00000080',
    borderRadius: 17,
  },
  buttonIcon: {
    color: 'white',
    fontSize: 22,
    marginBottom: 3,
    textAlign: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 13,
  },
  cameraButton: {
    backgroundColor: 'white',
    borderRadius: 50,
    flex: 1,
    margin: 3,
  },
  cameraNotAvailableContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 15,
  },
  cameraNotAvailableText: {
    color: 'white',
    fontSize: 25,
    textAlign: 'center',
  },
  cameracontainer: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  cameraOutline: {
    alignSelf: 'center',
    left: 30,
    borderColor: 'white',
    borderRadius: 50,
    borderWidth: 3,
    height: 70,
    width: 70,
  },
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
  flashControl: {
    alignItems: 'center',
    borderRadius: 30,
    height: 50,
    justifyContent: 'center',
    margin: 8,
    paddingTop: 7,
    width: 50,
  },
  loadingCameraMessage: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    bottom: 0,
    flex: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  processingContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(220, 220, 220, 0.7)',
    borderRadius: 16,
    height: 140,
    justifyContent: 'center',
    width: 200,
  },
  scanner: {
    flex: 1,
  },
});
